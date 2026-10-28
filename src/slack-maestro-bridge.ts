import { App } from '@slack/bolt';
import * as dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

interface Config {
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
  };
  aimaestro: {
    apiUrl: string;
    defaultAgent: string;
    botAgent: string;
    hostId: string;
  };
  cache: {
    agentTtlMs: number;
    hostsTtlMs: number;
    slackUserTtlMs: number;
  };
  polling: {
    intervalMs: number;
    timeoutMs: number;
  };
  debug: boolean;
}

function loadConfig(): Config {
  const required = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_SIGNING_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  return {
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN!,
      appToken: process.env.SLACK_APP_TOKEN!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
    },
    aimaestro: {
      apiUrl: process.env.AIMAESTRO_API || 'http://127.0.0.1:23000',
      defaultAgent: process.env.DEFAULT_AGENT || 'pas-lola',
      botAgent: 'slack-bot',
      hostId: process.env.HOST_ID || 'mini-lola',
    },
    cache: {
      agentTtlMs: parseInt(process.env.CACHE_AGENT_TTL_MS || '300000', 10),      // 5 min
      hostsTtlMs: parseInt(process.env.CACHE_HOSTS_TTL_MS || '60000', 10),       // 1 min
      slackUserTtlMs: parseInt(process.env.CACHE_SLACK_USER_TTL_MS || '600000', 10), // 10 min
    },
    polling: {
      intervalMs: parseInt(process.env.POLL_INTERVAL_MS || '2000', 10),
      timeoutMs: parseInt(process.env.POLL_TIMEOUT_MS || '5000', 10),
    },
    debug: process.env.DEBUG === 'true',
  };
}

const config = loadConfig();

// =============================================================================
// TYPES
// =============================================================================

interface Host {
  id: string;
  url: string;
  enabled: boolean;
}

interface ResolvedAgent {
  agentId: string;
  alias: string;
  displayName?: string;
}

interface AgentCacheEntry {
  agentId: string;
  alias: string;
  displayName?: string;
  host: string;
  hostUrl: string;
  cachedAt: number;
}

interface SlackUserCacheEntry {
  displayName: string;
  cachedAt: number;
}

interface HostsCacheEntry {
  hosts: Host[];
  cachedAt: number;
}

type LookupResult =
  | { status: 'found'; name: string; host: string; hostUrl: string; displayName?: string; fuzzy?: boolean }
  | { status: 'multiple'; matches: Array<{ alias: string; hostId: string }> }
  | { status: 'not_found' };

interface AIMessage {
  id: string;
  from: string;
  fromAlias?: string;
  subject: string;
  content?: {
    type?: string;
    message?: string;
    slack?: {
      channel: string;
      thread_ts: string;
      user: string;
    };
  };
}

interface AIMessagesResponse {
  messages?: AIMessage[];
}

interface AIResolveResponse {
  resolved?: {
    agentId: string;
    alias?: string;
    displayName?: string;
  };
}

interface AISearchResponse {
  results?: Array<{ alias: string; agentId: string; displayName?: string }>;
}

interface AIHostsResponse {
  hosts?: Host[];
}

// =============================================================================
// CACHES
// =============================================================================

class Cache<T> {
  private store = new Map<string, { value: T; cachedAt: number }>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, cachedAt: Date.now() });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Initialize caches
const agentCache = new Cache<AgentCacheEntry>(config.cache.agentTtlMs);
const slackUserCache = new Cache<string>(config.cache.slackUserTtlMs);
let hostsCache: HostsCacheEntry | null = null;

// =============================================================================
// SLACK APP
// =============================================================================

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function log(message: string, ...args: unknown[]): void {
  console.log(message, ...args);
}

function debug(message: string, ...args: unknown[]): void {
  if (config.debug) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

function parseAgentRouting(text: string): { agent: string; message: string } {
  // Find @AIM:agent-name anywhere in the message
  const match = text.match(/@AIM:([a-zA-Z0-9_-]+)/i);

  if (match) {
    // Remove the @AIM:agent-name from the message and clean up
    const message = text
      .replace(match[0], '')  // Remove the @AIM:agent part
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .replace(/^[,.\s]+/, '') // Remove leading punctuation/whitespace
      .trim();

    return {
      agent: match[1],
      message: message || '(no message)'
    };
  }

  return {
    agent: config.aimaestro.defaultAgent,
    message: text
  };
}

// =============================================================================
// HOST MANAGEMENT
// =============================================================================

async function getHosts(): Promise<Host[]> {
  // Check cache first
  if (hostsCache && Date.now() - hostsCache.cachedAt < config.cache.hostsTtlMs) {
    debug('Hosts cache hit');
    return hostsCache.hosts;
  }

  debug('Hosts cache miss, fetching...');

  try {
    const response = await fetch(`${config.aimaestro.apiUrl}/api/hosts`, {
      signal: AbortSignal.timeout(config.polling.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as AIHostsResponse;
    const hosts = (data.hosts || []).filter(h => h.enabled);

    hostsCache = { hosts, cachedAt: Date.now() };
    debug(`Cached ${hosts.length} hosts`);

    return hosts;
  } catch (error) {
    debug('Failed to get hosts:', error);
    // Return fallback with local host
    return [{ id: config.aimaestro.hostId, url: config.aimaestro.apiUrl, enabled: true }];
  }
}

// =============================================================================
// AGENT RESOLUTION
// =============================================================================

async function resolveOnHost(
  agentName: string,
  hostUrl: string,
  hostId: string
): Promise<ResolvedAgent | null> {
  try {
    const response = await fetch(
      `${hostUrl}/api/messages?action=resolve&agent=${encodeURIComponent(agentName)}`,
      { signal: AbortSignal.timeout(config.polling.timeoutMs) }
    );

    if (!response.ok) return null;

    const data = await response.json() as AIResolveResponse;

    if (data.resolved) {
      return {
        agentId: data.resolved.agentId,
        alias: data.resolved.alias || agentName,
        displayName: data.resolved.displayName
      };
    }

    return null;
  } catch (error) {
    debug(`Resolve failed on ${hostId}:`, error);
    return null;
  }
}

async function searchOnHost(
  agentName: string,
  hostUrl: string,
  hostId: string
): Promise<Array<{ alias: string; agentId: string; displayName?: string }>> {
  try {
    const response = await fetch(
      `${hostUrl}/api/messages?action=search&agent=${encodeURIComponent(agentName)}`,
      { signal: AbortSignal.timeout(config.polling.timeoutMs) }
    );

    if (!response.ok) return [];

    const data = await response.json() as AISearchResponse;
    return data.results || [];
  } catch (error) {
    debug(`Search failed on ${hostId}:`, error);
    return [];
  }
}

async function lookupAgentSmart(agentName: string): Promise<LookupResult> {
  // Check cache first
  const cached = agentCache.get(agentName.toLowerCase());
  if (cached) {
    debug(`Agent cache hit for "${agentName}"`);
    return {
      status: 'found',
      name: cached.agentId,
      host: cached.host,
      hostUrl: cached.hostUrl,
      displayName: cached.displayName
    };
  }

  debug(`Agent cache miss for "${agentName}", looking up...`);
  const hosts = await getHosts();

  // Phase 1: Try exact match on all hosts IN PARALLEL
  const exactPromises = hosts.map(async host => {
    const resolved = await resolveOnHost(agentName, host.url, host.id);
    if (resolved) {
      return {
        name: resolved.agentId,
        host: host.id,
        hostUrl: host.url,
        displayName: resolved.displayName,
        alias: resolved.alias
      };
    }
    return null;
  });

  const exactResults = await Promise.all(exactPromises);
  const exactMatches = exactResults.filter((r): r is NonNullable<typeof r> => r !== null);

  if (exactMatches.length === 1) {
    const match = exactMatches[0];

    // Cache the result
    agentCache.set(agentName.toLowerCase(), {
      agentId: match.name,
      alias: match.alias,
      displayName: match.displayName,
      host: match.host,
      hostUrl: match.hostUrl,
      cachedAt: Date.now()
    });

    // Also cache by alias if different
    if (match.alias && match.alias.toLowerCase() !== agentName.toLowerCase()) {
      agentCache.set(match.alias.toLowerCase(), {
        agentId: match.name,
        alias: match.alias,
        displayName: match.displayName,
        host: match.host,
        hostUrl: match.hostUrl,
        cachedAt: Date.now()
      });
    }

    return {
      status: 'found',
      name: match.name,
      host: match.host,
      hostUrl: match.hostUrl,
      displayName: match.displayName
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'multiple',
      matches: exactMatches.map(m => ({ alias: m.name, hostId: m.host }))
    };
  }

  // Phase 2: No exact match - try fuzzy search on all hosts IN PARALLEL
  const fuzzyPromises = hosts.map(async host => {
    const matches = await searchOnHost(agentName, host.url, host.id);
    return matches.map(match => ({
      alias: match.alias,
      hostId: host.id,
      hostUrl: host.url,
      agentId: match.agentId,
      displayName: match.displayName
    }));
  });

  const fuzzyResults = await Promise.all(fuzzyPromises);
  const fuzzyMatches = fuzzyResults.flat();

  if (fuzzyMatches.length === 1) {
    const match = fuzzyMatches[0];
    log(`[Lookup] Found partial match: ${match.alias}@${match.hostId}`);

    // Cache fuzzy match too
    agentCache.set(agentName.toLowerCase(), {
      agentId: match.agentId,
      alias: match.alias,
      displayName: match.displayName,
      host: match.hostId,
      hostUrl: match.hostUrl,
      cachedAt: Date.now()
    });

    return {
      status: 'found',
      name: match.agentId,
      host: match.hostId,
      hostUrl: match.hostUrl,
      displayName: match.displayName,
      fuzzy: true
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      status: 'multiple',
      matches: fuzzyMatches.map(m => ({ alias: m.alias, hostId: m.hostId }))
    };
  }

  return { status: 'not_found' };
}

async function lookupAgent(
  agentName: string
): Promise<{ name: string; host: string; displayName?: string } | null> {
  const result = await lookupAgentSmart(agentName);
  if (result.status === 'found') {
    return { name: result.name, host: result.host, displayName: result.displayName };
  }
  return null;
}

// =============================================================================
// SLACK USER RESOLUTION
// =============================================================================

async function getUserDisplayName(userId: string): Promise<string> {
  // Check cache first
  const cached = slackUserCache.get(userId);
  if (cached) {
    debug(`Slack user cache hit for ${userId}`);
    return cached;
  }

  debug(`Slack user cache miss for ${userId}, fetching...`);

  try {
    const result = await app.client.users.info({ user: userId });
    if (result.ok && result.user) {
      const displayName = result.user.real_name || result.user.name || userId;
      slackUserCache.set(userId, displayName);
      return displayName;
    }
  } catch (error) {
    debug(`Failed to get user info for ${userId}:`, error);
  }

  return userId;
}

// =============================================================================
// MESSAGE SENDING
// =============================================================================

async function sendToAgent(
  targetAgent: string,
  targetHost: string,
  text: string,
  channel: string,
  thread_ts: string,
  user: string
): Promise<void> {
  const payload = {
    from: config.aimaestro.botAgent,
    fromHost: config.aimaestro.hostId,
    to: targetAgent,
    toHost: targetHost,
    subject: `Slack: Message from ${user}`,
    priority: 'normal',
    content: {
      type: 'request',
      message: text,
      slack: {
        channel,
        thread_ts,
        user
      }
    }
  };

  const response = await fetch(`${config.aimaestro.apiUrl}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.polling.timeoutMs)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send to ${targetAgent}: ${error}`);
  }

  log(`[-> ${targetAgent}@${targetHost}] Message from ${user}: ${text.substring(0, 50)}...`);
}

// =============================================================================
// RESPONSE POLLING
// =============================================================================

let isPolling = false;
let pollTimeoutId: NodeJS.Timeout | null = null;

async function checkAgentResponses(): Promise<void> {
  // Prevent concurrent polling
  if (isPolling) {
    debug('Polling already in progress, skipping...');
    return;
  }

  isPolling = true;

  try {
    const response = await fetch(
      `${config.aimaestro.apiUrl}/api/messages?agent=${encodeURIComponent(config.aimaestro.botAgent)}&box=inbox&status=unread`,
      { signal: AbortSignal.timeout(config.polling.timeoutMs) }
    );

    if (!response.ok) return;

    const data = await response.json() as AIMessagesResponse;
    const messages = data.messages || [];

    for (const msgSummary of messages) {
      await processIncomingMessage(msgSummary);
    }
  } catch (error) {
    debug('Poll error:', error);
  } finally {
    isPolling = false;
  }
}

async function processIncomingMessage(msgSummary: AIMessage): Promise<void> {
  const fromAgent = msgSummary.from || msgSummary.fromAlias || 'unknown';
  log(`[<- ${fromAgent}] Response received: ${msgSummary.subject}`);

  try {
    // Fetch full message to get content
    const fullMsgResponse = await fetch(
      `${config.aimaestro.apiUrl}/api/messages?agent=${encodeURIComponent(config.aimaestro.botAgent)}&id=${encodeURIComponent(msgSummary.id)}&box=inbox`,
      { signal: AbortSignal.timeout(config.polling.timeoutMs) }
    );

    if (!fullMsgResponse.ok) return;

    const msg = await fullMsgResponse.json() as AIMessage;
    const slackContext = msg.content?.slack;
    const responseText = msg.content?.message || msg.content;

    if (slackContext?.channel && slackContext?.thread_ts) {
      // Get display name (from cache or lookup)
      let agentDisplayName = msg.fromAlias || fromAgent;

      const agentLookup = await lookupAgent(msg.fromAlias || fromAgent);
      if (agentLookup?.displayName) {
        agentDisplayName = agentLookup.displayName;
      }

      const formattedResponse = `*[${agentDisplayName}]* ${
        typeof responseText === 'string' ? responseText : JSON.stringify(responseText)
      }`;

      // Send response to Slack
      await app.client.chat.postMessage({
        channel: slackContext.channel,
        thread_ts: slackContext.thread_ts,
        text: formattedResponse,
      });

      log(`[-> Slack] Response from ${agentDisplayName} sent to ${slackContext.channel}/${slackContext.thread_ts}`);

      // Add checkmark reaction
      await app.client.reactions.add({
        channel: slackContext.channel,
        timestamp: slackContext.thread_ts,
        name: 'white_check_mark',
      }).catch(() => {}); // Ignore if reaction already exists

    } else {
      log(`[<- ${fromAgent}] Message has no Slack context, skipping: ${msg.subject}`);
    }

    // Mark message as read
    await fetch(
      `${config.aimaestro.apiUrl}/api/messages?agent=${encodeURIComponent(config.aimaestro.botAgent)}&id=${encodeURIComponent(msg.id)}&action=read`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(config.polling.timeoutMs)
      }
    ).catch(err => debug('Failed to mark as read:', err));

  } catch (error) {
    console.error('Failed to process message:', error);
  }
}

function startPolling(): void {
  const poll = async () => {
    await checkAgentResponses();
    // Schedule next poll AFTER completion (not fixed interval)
    pollTimeoutId = setTimeout(poll, config.polling.intervalMs);
  };

  poll();
  log(`Polling every ${config.polling.intervalMs}ms...`);
}

function stopPolling(): void {
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
    pollTimeoutId = null;
  }
}

// =============================================================================
// MESSAGE ROUTING
// =============================================================================

async function routeMessage(
  text: string,
  channel: string,
  thread_ts: string,
  userId: string,
  say: (msg: { text: string; thread_ts: string }) => Promise<unknown>
): Promise<void> {
  const { agent, message } = parseAgentRouting(text);
  const userName = await getUserDisplayName(userId);
  const result = await lookupAgentSmart(agent);

  if (result.status === 'not_found') {
    await say({
      text: `Agent \`${agent}\` not found on any host.\n\nUse \`@AIM:agent-name message\` to route to a specific agent.`,
      thread_ts
    });
    return;
  }

  if (result.status === 'multiple') {
    const matchList = result.matches.map(m => `- \`${m.alias}@${m.hostId}\``).join('\n');
    await say({
      text: `Found multiple matches for \`${agent}\`:\n\n${matchList}\n\nPlease specify the full agent name, e.g.:\n\`@AIM:${result.matches[0].alias}@${result.matches[0].hostId} your message\``,
      thread_ts
    });
    return;
  }

  // Found exactly one match
  if (result.fuzzy) {
    await say({
      text: `Found partial match: \`${result.name}@${result.host}\``,
      thread_ts
    });
  }

  await sendToAgent(result.name, result.host, message, channel, thread_ts, userName);
}

// =============================================================================
// SLACK EVENT HANDLERS
// =============================================================================

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;
  const user = event.user || 'unknown';
  const thread_ts = event.thread_ts || event.ts;

  log(`[Slack <-] Mention from ${user}: ${text.substring(0, 50)}...`);

  try {
    await app.client.reactions.add({
      channel: channel,
      timestamp: event.ts,
      name: 'eyes',
    }).catch(() => {});

    await routeMessage(text, channel, thread_ts, user, say);
  } catch (error) {
    console.error('Error routing message:', error);
    await say({ text: 'Failed to route message. Please try again.', thread_ts });
  }
});

app.event('message', async ({ event, say }) => {
  const messageEvent = event as {
    channel_type?: string;
    bot_id?: string;
    text?: string;
    channel: string;
    user?: string;
    thread_ts?: string;
    ts: string
  };

  if (messageEvent.channel_type !== 'im') return;
  if (messageEvent.bot_id) return;

  const text = messageEvent.text || '';
  const channel = messageEvent.channel;
  const user = messageEvent.user || 'unknown';
  const thread_ts = messageEvent.thread_ts || messageEvent.ts;

  log(`[Slack <-] DM from ${user}: ${text.substring(0, 50)}...`);

  try {
    await app.client.reactions.add({
      channel: channel,
      timestamp: messageEvent.ts,
      name: 'eyes',
    }).catch(() => {});

    await routeMessage(text, channel, thread_ts, user, say);
  } catch (error) {
    console.error('Error routing message:', error);
    await say({ text: 'Failed to route message. Please try again.', thread_ts });
  }
});

app.event('member_joined_channel', async ({ event }) => {
  try {
    const authResult = await app.client.auth.test();
    if (event.user === authResult.user_id) {
      log(`[Slack] Joined channel ${event.channel}`);

      await app.client.chat.postMessage({
        channel: event.channel,
        text: `Hi! I'm the AI Maestro gateway. Message me to reach agents on the network.\n\n` +
              `- DM or @mention me to talk to the default agent\n` +
              `- Use \`@AIM:agent-name\` to route to a specific agent`,
      });
    }
  } catch (error) {
    debug('Error handling channel join:', error);
  }
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log(`\n${signal} received, shutting down gracefully...`);

  // Stop polling
  stopPolling();

  // Clear caches
  agentCache.clear();
  slackUserCache.clear();
  hostsCache = null;

  // Close Slack connection
  try {
    await app.stop();
    log('Slack connection closed');
  } catch (error) {
    debug('Error closing Slack connection:', error);
  }

  log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  log('AI Maestro Slack Bridge starting...');
  log(`   Default agent: ${config.aimaestro.defaultAgent}`);
  log(`   Bot agent: ${config.aimaestro.botAgent}`);
  log(`   Host ID: ${config.aimaestro.hostId}`);
  log(`   AI Maestro API: ${config.aimaestro.apiUrl}`);
  log(`   Cache TTLs: agent=${config.cache.agentTtlMs}ms, hosts=${config.cache.hostsTtlMs}ms, slack=${config.cache.slackUserTtlMs}ms`);
  log(`   Poll interval: ${config.polling.intervalMs}ms`);

  // Pre-warm caches
  log('Pre-warming caches...');
  await getHosts();
  await lookupAgentSmart(config.aimaestro.defaultAgent);
  log(`   Agent cache: ${agentCache.size()} entries`);

  // Start the Slack app
  await app.start();
  log('Connected to Slack (Socket Mode)');

  // Start polling for agent responses
  startPolling();

  log('');
  log('Bridge ready!');
  log('   - DM the bot or @mention in channels');
  log('   - Use @AIM:agent-name to route to specific agents');
  log('   - Messages forwarded to AI Maestro network');
  log('   - Responses sent back to Slack');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
