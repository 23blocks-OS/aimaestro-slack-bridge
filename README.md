# AI Maestro Slack Bridge

Connect your Slack workspace to [AI Maestro](https://github.com/23blocks-OS/ai-maestro) agents. Send messages from Slack to AI agents and receive responses in threads.

## Features

- **Slack ↔ AI Maestro**: Bridge messages between Slack and AI Maestro agents
- **DM & Mentions**: Message agents via DM or @mention in channels
- **Thread Support**: Responses delivered to the original Slack thread
- **Multi-Agent Routing** *(coming soon)*: Route to specific agents with `@AIM:agent-name`
- **Cross-Host**: Route messages to agents on any host in your AI Maestro network

## Architecture

```
Slack Message → Slack Bridge → AI Maestro API → Target Agent
                                                      ↓
Slack Thread  ← Slack Bridge ← AI Maestro API ← Agent Response
```

## Prerequisites

- [AI Maestro](https://github.com/23blocks-OS/ai-maestro) running on your network
- Node.js 18+
- A Slack workspace with admin access

## Quick Start

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From manifest**
3. Select your workspace
4. Paste this manifest:

```yaml
display_information:
  name: AI Maestro
  description: Bridge to AI Maestro agents
  background_color: "#4A154B"
features:
  bot_user:
    display_name: AI Maestro
    always_online: true
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - chat:write.public
      - im:history
      - im:read
      - im:write
      - users:read
      - reactions:read
      - reactions:write
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.im
      - member_joined_channel
  socket_mode_enabled: true
```

5. Click **Create**
6. Install the app to your workspace

### 2. Get Your Tokens

From your Slack app settings, collect:

| Token | Location | Format |
|-------|----------|--------|
| Bot Token | OAuth & Permissions | `xoxb-...` |
| App Token | Basic Information → App-Level Tokens → Generate (scope: `connections:write`) | `xapp-...` |
| Signing Secret | Basic Information | 32-char hex |

### 3. Install & Configure

```bash
git clone https://github.com/23blocks-OS/aimaestro-slack-bridge.git
cd aimaestro-slack-bridge
npm install
cp .env.example .env
```

Edit `.env`:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# Optional: Base directory for agent working directories
BASE_DIRECTORY=/home/user/projects
```

### 4. Register the Bridge Agent

Register `slack-bot` as an agent in AI Maestro:

```bash
curl -X POST http://127.0.0.1:23000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name": "slack-bot", "description": "Slack bridge bot"}'
```

### 5. Run

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

## Usage

### DM the Bot

Send a direct message to the bot in Slack. It will be forwarded to your default AI Maestro agent.

### Mention in Channels

```
@AI Maestro what's the status of the project?
```

### Route to Specific Agent *(coming soon)*

```
@AIM:backend-api check the server health
@AIM:frontend-dev review the CSS changes
```

## How It Works

1. **Incoming**: Slack message → Bridge parses → Sends to AI Maestro agent's inbox
2. **Processing**: Agent reads message, processes, sends response to `slack-bot` inbox
3. **Outgoing**: Bridge polls inbox → Finds response → Posts to Slack thread

Messages include Slack context (channel, thread, user) so responses route back correctly.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Yes | App-Level Token (`xapp-...`) |
| `SLACK_SIGNING_SECRET` | Yes | Signing secret for verification |
| `AIMAESTRO_API` | No | AI Maestro API URL (default: `http://127.0.0.1:23000`) |
| `DEFAULT_AGENT` | No | Default agent to receive messages |
| `BASE_DIRECTORY` | No | Base path for relative directories |
| `DEBUG` | No | Enable debug logging (`true`) |

## Running as a Service

### Using PM2

```bash
npm install -g pm2
pm2 start npm --name "slack-bridge" -- start
pm2 save
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/aimaestro-slack-bridge.service`:

```ini
[Unit]
Description=AI Maestro Slack Bridge
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/aimaestro-slack-bridge
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/path/to/aimaestro-slack-bridge/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable aimaestro-slack-bridge
sudo systemctl start aimaestro-slack-bridge
```

## Roadmap

- [x] Basic Slack ↔ AI Maestro messaging
- [x] DM and mention support
- [x] Thread-based responses
- [ ] Agent routing via `@AIM:agent-name`
- [ ] Multi-workspace support
- [ ] File/image attachments
- [ ] Slash commands
- [ ] Rate limit handling

See [BACKLOG.md](./BACKLOG.md) for detailed plans.

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## Credits

Based on [claude-code-slack-bot](https://github.com/mpociot/claude-code-slack-bot) by Marcel Pociot.

## License

MIT - see [LICENSE](./LICENSE)
