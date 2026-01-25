# AI Maestro Slack Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![AI Maestro](https://img.shields.io/badge/AI%20Maestro-Compatible-purple.svg)](https://github.com/23blocks-OS/ai-maestro)

> **Connect your team to AI agents through Slack** - No terminal access required.

---

## The Problem

Your team wants to interact with AI coding agents, but:

- **Not everyone has terminal access** - PMs, designers, and stakeholders can't use CLI tools
- **Context switching is expensive** - Developers shouldn't leave Slack to ask agents questions
- **AI agents are siloed** - Each agent runs in its own tmux session, inaccessible to non-developers
- **No audit trail** - Agent conversations happen in terminals with no team visibility

## The Solution

**AI Maestro Slack Bridge** connects your Slack workspace directly to your AI Maestro agents:

```
Team Member (Slack)  →  "@AIM:backend-api check server health"
                                    ↓
                           AI Maestro Agent
                                    ↓
Team Member (Slack)  ←  "🤖 [backend-api] All services healthy..."
```

**Now anyone on your team can:**
- Ask agents questions via DM or channel mentions
- Route to specific agents with `@AIM:agent-name` syntax
- Get responses in threaded conversations
- Access agents across your entire mesh network

---

## Features

| Feature | Description |
|---------|-------------|
| **Bidirectional Messaging** | Send messages to agents, receive responses in Slack threads |
| **Agent Routing** | Target specific agents with `@AIM:agent-name` syntax |
| **DM & Mentions** | Message via direct message or @mention in channels |
| **Cross-Host Discovery** | Route to agents on any host in your AI Maestro network |
| **Thread Context** | Conversations stay organized in Slack threads |
| **Real-time Notifications** | Agents get notified instantly via tmux |

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Slack User    │      │   Slack Bridge   │      │   AI Maestro    │
│                 │      │                  │      │                 │
│  @AIM:backend   │─────▶│  Parse & Route   │─────▶│  Agent Inbox    │
│  "check health" │      │                  │      │                 │
│                 │      │                  │      │  ┌───────────┐  │
│  ◀─────────────────────│  Poll Response   │◀─────│  │  Agent    │  │
│  🤖 [backend]   │      │                  │      │  │  Process  │  │
│  "All healthy"  │      │                  │      │  └───────────┘  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

## Prerequisites

- [AI Maestro](https://github.com/23blocks-OS/ai-maestro) running (v0.18.0+)
- Node.js 18+
- A Slack workspace with admin access

## Quick Start

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From manifest**
3. Select your workspace
4. Paste the manifest from [`slack-app-manifest.yaml`](./slack-app-manifest.yaml)
5. Click **Create** and install to your workspace

### 2. Get Your Tokens

From your Slack app settings:

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
AIMAESTRO_API=http://127.0.0.1:23000
DEFAULT_AGENT=your-default-agent
```

### 4. Register the Bridge Agent

```bash
curl -X POST http://127.0.0.1:23000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"name": "slack-bot", "description": "Slack bridge bot"}'
```

### 5. Run

```bash
# Development
npm run dev

# Production
npm start
```

## Usage Examples

### DM the Bot
Send a direct message to **AI Maestro** in Slack.

### Mention in Channels
```
@AI Maestro what's the status of the project?
```

### Route to Specific Agents
```
@AIM:backend-api check the server health
@AIM:frontend-dev review the CSS changes
@AIM:data-analyst run the daily metrics report
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | Yes | - | Bot User OAuth Token |
| `SLACK_APP_TOKEN` | Yes | - | App-Level Token |
| `SLACK_SIGNING_SECRET` | Yes | - | Signing secret |
| `AIMAESTRO_API` | No | `http://127.0.0.1:23000` | AI Maestro API URL |
| `DEFAULT_AGENT` | No | - | Default agent for messages |
| `DEBUG` | No | `false` | Enable debug logging |

## Production Deployment

### Using PM2 (Recommended)

```bash
npm install -g pm2
pm2 start npm --name "slack-bridge" -- start
pm2 save
pm2 startup
```

### Using systemd

```bash
# See docs for full systemd configuration
sudo systemctl enable aimaestro-slack-bridge
sudo systemctl start aimaestro-slack-bridge
```

## Roadmap

- [x] Slack ↔ AI Maestro messaging
- [x] DM and @mention support
- [x] Thread-based responses
- [x] Agent routing (`@AIM:agent-name`)
- [x] Cross-host agent discovery
- [x] Real-time agent notifications
- [ ] Multi-workspace support
- [ ] File/image attachments
- [ ] Slash commands (`/aim`)
- [ ] Reaction-based commands

See [BACKLOG.md](./BACKLOG.md) for detailed plans.

## Security

See [SECURITY.md](./SECURITY.md) for security policy and reporting vulnerabilities.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Credits

Based on [claude-code-slack-bot](https://github.com/mpociot/claude-code-slack-bot) by Marcel Pociot.

## Related Projects

- [AI Maestro](https://github.com/23blocks-OS/ai-maestro) - The main dashboard for managing AI coding agents
- [AI Maestro Documentation](https://23blocks-os.github.io/ai-maestro/) - Full documentation

## License

MIT - see [LICENSE](./LICENSE)

---

<p align="center">
  <b>Made with ❤️ by <a href="https://github.com/23blocks-OS">23blocks</a></b><br>
  <sub>Empowering teams to collaborate with AI agents</sub>
</p>
