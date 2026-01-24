import { App } from '@slack/bolt';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

const AIMAESTRO_API = process.env.AIMAESTRO_API || 'http://127.0.0.1:23000';
const DEFAULT_AGENT = process.env.DEFAULT_AGENT || 'pas-lola';
const SLACK_BOT_AGENT = 'slack-bot';
const HOST_ID = process.env.HOST_ID || 'mini-lola';
const DEBUG = process.env.DEBUG === 'true';

// Initialize Slack app
const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
});

// Parse @AIM:agent-name from message text
// Returns { agent: string, message: string }
function parseAgentRouting(text: string): { agent: string; message: string } {
  // Pattern: @AIM:agent-name at the start of message
  const match = text.match(/^@AIM:([a-zA-Z0-9_-]+)\s*(.*)/i);

  if (match) {
    return {
      agent: match[1],
      message: match[2].trim() || '(no message)'
    };
  }

  // No @AIM prefix, use default agent
  return {
    agent: DEFAULT_AGENT,
    message: text
  };
}

// Lookup agent in AI Maestro to get host info
async function lookupAgent(agentName: string): Promise<{ name: string; host: string } | null> {
  try {
    const response = await fetch(`${AIMAESTRO_API}/api/agents?name=${encodeURIComponent(agentName)}`);
    if (!response.ok) return null;

    const data = await response.json();

    // API returns { agents: [...] }
    const agents = data.agents || data;

    if (Array.isArray(agents) && agents.length > 0) {
      const agent = agents.find((a: any) => a.name === agentName);
      if (agent) {
        return { name: agent.name, host: agent.hostId || HOST_ID };
      }
    }

    // Single agent response
    if (data.name) {
      return { name: data.name, host: data.hostId || HOST_ID };
    }

    return null;
  } catch (error) {
    if (DEBUG) console.error(`[Lookup] Failed to lookup agent ${agentName}:`, error);
    return null;
  }
}

// Send message to an agent via AI Maestro API
async function sendToAgent(
  targetAgent: string,
  targetHost: string,
  text: string,
  channel: string,
  thread_ts: string,
  user: string
): Promise<void> {
  const payload = {
    from: SLACK_BOT_AGENT,
    fromHost: HOST_ID,
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

  const response = await fetch(`${AIMAESTRO_API}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send to ${targetAgent}: ${error}`);
  }

  console.log(`[→ ${targetAgent}@${targetHost}] Message from ${user}: ${text.substring(0, 50)}...`);
}

// Check for responses from ANY agent
async function checkAgentResponses(): Promise<void> {
  try {
    const response = await fetch(
      `${AIMAESTRO_API}/api/messages?agent=${SLACK_BOT_AGENT}&box=inbox&status=unread`
    );

    if (!response.ok) return;

    const data = await response.json();
    const messages = data.messages || [];

    for (const msgSummary of messages) {
      const fromAgent = msgSummary.from || msgSummary.fromAlias || 'unknown';
      console.log(`[← ${fromAgent}] Response received: ${msgSummary.subject}`);

      // Fetch full message to get content (list only returns preview)
      const fullMsgResponse = await fetch(
        `${AIMAESTRO_API}/api/messages?agent=${SLACK_BOT_AGENT}&id=${msgSummary.id}&box=inbox`
      );
      if (!fullMsgResponse.ok) continue;
      const msg = await fullMsgResponse.json();

      // Extract Slack context from the message
      const slackContext = msg.content?.slack;
      const responseText = msg.content?.message || msg.content;

      if (slackContext && slackContext.channel && slackContext.thread_ts) {
        try {
          // Format response with agent display name
          // Look up agent to get their label (display name)
          let agentDisplayName = msg.fromAlias || fromAgent;
          try {
            const agentLookup = await lookupAgent(msg.fromAlias || fromAgent);
            if (agentLookup) {
              // Fetch full agent info to get label
              const agentResp = await fetch(`${AIMAESTRO_API}/api/agents?name=${encodeURIComponent(agentLookup.name)}`);
              if (agentResp.ok) {
                const agentData = await agentResp.json();
                const agents = agentData.agents || [];
                const agent = agents.find((a: any) => a.name === agentLookup.name);
                if (agent?.label) {
                  agentDisplayName = agent.label;
                }
              }
            }
          } catch (e) {
            // Fall back to alias
          }
          const formattedResponse = `🤖 *[${agentDisplayName}]* ${typeof responseText === 'string' ? responseText : JSON.stringify(responseText)}`;

          // Send response to Slack
          await app.client.chat.postMessage({
            channel: slackContext.channel,
            thread_ts: slackContext.thread_ts,
            text: formattedResponse,
          });

          console.log(`[→ Slack] Response from ${agentLabel} sent to ${slackContext.channel}/${slackContext.thread_ts}`);

          // Add checkmark reaction
          await app.client.reactions.add({
            channel: slackContext.channel,
            timestamp: slackContext.thread_ts,
            name: 'white_check_mark',
          }).catch(() => {}); // Ignore if reaction already exists

        } catch (slackError) {
          console.error('Failed to send to Slack:', slackError);
        }
      } else {
        console.log(`[← ${fromAgent}] Message has no Slack context, skipping:`, msg.subject);
      }

      // Mark message as read
      await fetch(
        `${AIMAESTRO_API}/api/messages?agent=${SLACK_BOT_AGENT}&id=${msg.id}&action=read`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' } }
      ).catch(err => console.error('Failed to mark as read:', err));
    }
  } catch (error) {
    // Silently ignore polling errors (API might be temporarily unavailable)
    if (DEBUG) console.error('[Poll] Error:', error);
  }
}

// Get Slack user's display name
async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const result = await app.client.users.info({ user: userId });
    if (result.ok && result.user) {
      return result.user.real_name || result.user.name || userId;
    }
  } catch (error) {
    if (DEBUG) console.error(`[Slack] Failed to get user info for ${userId}:`, error);
  }
  return userId;
}

// Process incoming message and route to appropriate agent
async function routeMessage(
  text: string,
  channel: string,
  thread_ts: string,
  userId: string,
  say: (msg: { text: string; thread_ts: string }) => Promise<any>
): Promise<void> {
  // Parse @AIM:agent-name routing
  const { agent, message } = parseAgentRouting(text);

  // Get user's display name
  const userName = await getUserDisplayName(userId);

  // Lookup agent to get host info
  const agentInfo = await lookupAgent(agent);

  if (!agentInfo) {
    // Agent not found - notify user
    await say({
      text: `❌ Agent \`${agent}\` not found in the network. Use \`@AIM:agent-name message\` to route to a specific agent.`,
      thread_ts
    });
    return;
  }

  // Send to the target agent with display name
  await sendToAgent(agentInfo.name, agentInfo.host, message, channel, thread_ts, userName);
}

// Handle app mentions in channels
app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;
  const user = event.user;
  const thread_ts = event.thread_ts || event.ts;

  console.log(`[Slack ←] Mention from ${user}: ${text.substring(0, 50)}...`);

  try {
    // Add eyes reaction to show we received it
    await app.client.reactions.add({
      channel: channel,
      timestamp: event.ts,
      name: 'eyes',
    });

    // Route message to appropriate agent
    await routeMessage(text, channel, thread_ts, user, say);

  } catch (error) {
    console.error('Error routing message:', error);
    await say({ text: '❌ Failed to route message. Please try again.', thread_ts });
  }
});

// Handle direct messages
app.event('message', async ({ event, say }) => {
  const messageEvent = event as any;

  // Only handle DMs (im = instant message)
  if (messageEvent.channel_type !== 'im') return;

  // Ignore bot messages
  if ('bot_id' in messageEvent) return;

  const text = messageEvent.text || '';
  const channel = messageEvent.channel;
  const user = messageEvent.user;
  const thread_ts = messageEvent.thread_ts || messageEvent.ts;

  console.log(`[Slack ←] DM from ${user}: ${text.substring(0, 50)}...`);

  try {
    // Add eyes reaction
    await app.client.reactions.add({
      channel: channel,
      timestamp: messageEvent.ts,
      name: 'eyes',
    });

    // Route message to appropriate agent
    await routeMessage(text, channel, thread_ts, user, say);

  } catch (error) {
    console.error('Error routing message:', error);
    await say({ text: '❌ Failed to route message. Please try again.', thread_ts });
  }
});

// Handle bot joining a channel
app.event('member_joined_channel', async ({ event }) => {
  if (event.user === (await app.client.auth.test()).user_id) {
    console.log(`[Slack] Joined channel ${event.channel}`);

    await app.client.chat.postMessage({
      channel: event.channel,
      text: `👋 Hi! I'm the AI Maestro gateway. Message me to reach agents on the network.\n\n` +
            `• DM or @mention me to talk to the default agent\n` +
            `• Use \`@AIM:agent-name\` to route to a specific agent`,
    });
  }
});

// Main
async function main() {
  console.log('🤖 AI Maestro Slack Bridge starting...');
  console.log(`   Default agent: ${DEFAULT_AGENT}`);
  console.log(`   Bot agent: ${SLACK_BOT_AGENT}`);
  console.log(`   Host ID: ${HOST_ID}`);
  console.log(`   AI Maestro API: ${AIMAESTRO_API}`);

  // Start the Slack app
  await app.start();
  console.log('⚡️ Connected to Slack (Socket Mode)');

  // Poll for agent responses every 2 seconds
  setInterval(checkAgentResponses, 2000);
  console.log('👀 Watching for agent responses...');

  console.log('');
  console.log('✅ Bridge ready!');
  console.log('   - DM the bot or @mention in channels');
  console.log('   - Use @AIM:agent-name to route to specific agents');
  console.log('   - Messages forwarded to AI Maestro network');
  console.log('   - Responses sent back to Slack');
}

main().catch(console.error);
