import { App } from '@slack/bolt';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN!;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

const AIMAESTRO_API = 'http://127.0.0.1:23000';
const LOLA_AGENT = 'pas-lola';
const SLACK_BOT_AGENT = 'slack-bot';
const HOST_ID = 'mini-lola';

// Initialize Slack app
const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
});

// Send message to Lola via AI Maestro API
async function sendToLola(text: string, channel: string, thread_ts: string, user: string): Promise<void> {
  const payload = {
    from: SLACK_BOT_AGENT,
    fromHost: HOST_ID,
    to: LOLA_AGENT,
    toHost: HOST_ID,
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
    throw new Error(`Failed to send to Lola: ${error}`);
  }

  console.log(`[→ Lola] Message sent from ${user}: ${text.substring(0, 50)}...`);
}

// Check for responses from Lola
async function checkLolaResponses(): Promise<void> {
  try {
    const response = await fetch(
      `${AIMAESTRO_API}/api/messages?agent=${SLACK_BOT_AGENT}&box=inbox&status=unread`
    );

    if (!response.ok) return;

    const data = await response.json();
    const messages = data.messages || [];

    for (const msgSummary of messages) {
      // Only process messages from Lola
      if (msgSummary.from !== LOLA_AGENT && msgSummary.fromAlias !== LOLA_AGENT) continue;

      console.log(`[← Lola] Response received: ${msgSummary.subject}`);

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
          // Send response to Slack
          await app.client.chat.postMessage({
            channel: slackContext.channel,
            thread_ts: slackContext.thread_ts,
            text: typeof responseText === 'string' ? responseText : JSON.stringify(responseText),
          });

          console.log(`[→ Slack] Response sent to ${slackContext.channel}/${slackContext.thread_ts}`);

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
        console.log(`[← Lola] Message has no Slack context, skipping:`, msg.subject);
      }

      // Mark message as read
      await fetch(
        `${AIMAESTRO_API}/api/messages?agent=${SLACK_BOT_AGENT}&id=${msg.id}&action=read`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' } }
      ).catch(err => console.error('Failed to mark as read:', err));
    }
  } catch (error) {
    // Silently ignore polling errors (API might be temporarily unavailable)
  }
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

    // Send to Lola
    await sendToLola(text, channel, thread_ts, user);

  } catch (error) {
    console.error('Error forwarding to Lola:', error);
    await say({ text: '❌ Failed to reach Lola. Please try again.', thread_ts });
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

    // Send to Lola
    await sendToLola(text, channel, thread_ts, user);

  } catch (error) {
    console.error('Error forwarding to Lola:', error);
    await say({ text: '❌ Failed to reach Lola. Please try again.', thread_ts });
  }
});

// Handle bot joining a channel
app.event('member_joined_channel', async ({ event }) => {
  if (event.user === (await app.client.auth.test()).user_id) {
    console.log(`[Slack] Joined channel ${event.channel}`);

    await app.client.chat.postMessage({
      channel: event.channel,
      text: `👋 Hi! I'm Lola, Juan's Chief of Staff. Mention me with @Lola to chat!`,
    });
  }
});

// Main
async function main() {
  console.log('🤖 Slack-AI Maestro Bridge starting...');
  console.log(`   Lola agent: ${LOLA_AGENT}`);
  console.log(`   Bot agent: ${SLACK_BOT_AGENT}`);
  console.log(`   AI Maestro API: ${AIMAESTRO_API}`);

  // Start the Slack app
  await app.start();
  console.log('⚡️ Connected to Slack (Socket Mode)');

  // Poll for Lola's responses every 2 seconds
  setInterval(checkLolaResponses, 2000);
  console.log('👀 Watching for Lola\'s responses...');

  console.log('');
  console.log('✅ Bridge ready!');
  console.log('   - DM the bot or @mention in channels');
  console.log('   - Messages forwarded to Lola via AI Maestro');
  console.log('   - Responses sent back to Slack');
}

main().catch(console.error);
