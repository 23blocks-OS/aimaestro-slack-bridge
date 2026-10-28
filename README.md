# AI Maestro Slack Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-orange.svg)](https://claude.ai/code)
[![AI Maestro](https://img.shields.io/badge/AI%20Maestro-Compatible-purple.svg)](https://github.com/23blocks-OS/ai-maestro)

> **Connect your Slack workspace to your Claude Code agents** - Supercharge your team's AI coding workflow without additional API costs.

---

## How is this different from Claude for Slack?

| Feature | AI Maestro Slack Bridge | Official Claude for Slack |
|---------|------------------------|---------------------------|
| **API Usage** | **No extra calls** - uses your running agents | Creates new API sessions per message |
| **Agent Persistence** | Connects to **running** Claude Code sessions | Starts new sessions each time |
| **Context Retention** | Agents keep full project context | Fresh context per conversation |
| **Hosting** | Your machines (local/cloud) | Anthropic's cloud (claude.com/code) |
| **Claude Code Skills** | Full access to custom skills & hooks | Limited to web capabilities |
| **Multi-Agent** | Route to any agent in your network | Single Claude instance |
| **Bridge Cost** | Free & open source | Included with Pro/Team/Enterprise |

*Note: You still need a Claude subscription (Pro/Max) or API credits to run your Claude Code agents. The bridge itself doesn't make additional API calls - it routes messages to agents you're already running.*

**Bottom line**: Official Claude for Slack creates *new* Claude sessions via API. We connect to your *existing* Claude Code agents - the ones already running with your codebase loaded, your skills installed, and your context intact.

---

## The Problem

Your team wants to interact with Claude Code agents, but:

- **Not everyone has terminal access** - PMs, designers, and stakeholders can't use CLI tools
- **Context switching is expensive** - Developers shouldn't leave Slack to query agents
- **Claude Code agents are siloed** - Each runs in its own tmux session, invisible to non-developers
- **Extra API calls** - Official Slack apps create new sessions, consuming more of your quota
- **No persistent context** - Official Slack apps start fresh each time

## The Solution

**AI Maestro Slack Bridge** connects Slack directly to your running Claude Code agents:

```
Team Member (Slack)  →  "@AIM:backend-api check server health"
                                    ↓
                         Your Running Claude Code Agent
                         (with full project context intact)
                                    ↓
Team Member (Slack)  ←  "🤖 [backend-api] All services healthy..."
```

**Your Claude Code superpowers, now in Slack:**
- Custom skills and hooks work seamlessly
- Agents retain full codebase context
- No additional API calls or costs
- Route to any agent across your mesh network

---

## Features

| Feature | Description |
|---------|-------------|
| **No Extra API Calls** | Routes to running agents - no additional Claude API consumption |
| **Full Context** | Agents keep your codebase, skills, and conversation history |
| **Agent Routing** | Target specific agents with `@AIM:agent-name` syntax |
| **Skills & Hooks** | Your Claude Code skills work through Slack |
| **Cross-Host** | Route to agents on any machine in your network |
| **Thread Responses** | Conversations stay organized in Slack threads |

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Slack User    │      │   Slack Bridge   │      │   AI Maestro    │
│                 │      │                  │      │                 │
│  @AIM:backend   │─────▶│  Parse & Route   │─────▶│  Agent Inbox    │
│  "check health" │      │                  │      │                 │
│                 │      │  (Routes only!)  │      │  ┌───────────┐  │
│  ◀─────────────────────│  Poll Response   │◀─────│  │Claude Code│  │
│  🤖 [backend]   │      │                  │      │  │  Agent    │  │
│  "All healthy"  │      │                  │      │  │ (running) │  │
└─────────────────┘      └──────────────────┘      │  └───────────┘  │
                                                   └─────────────────┘
```

## Prerequisites

- [AI Maestro](https://github.com/23blocks-OS/ai-maestro) running (v0.18.0+)
- Claude Code agents running in tmux sessions
- Node.js 24 (or 22.23.4+)
- Slack workspace with admin access

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

### Route to Specific Claude Code Agents
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
| `OPERATOR_SLACK_IDS` | No | empty | Comma-separated Slack user IDs (e.g. `U01ABC,U02DEF`) whose messages are trusted. Everyone else is external: their text is wrapped in an `<external-content ... trust="none">` block, flagged for prompt-injection patterns and stripped of control characters before it reaches the agent. Empty means all senders are external. |
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

## Why Use This Over Official Claude for Slack?

1. **Cost**: Zero additional API costs - your agents are already running
2. **Context**: Agents keep full project context, skills, and hooks
3. **Control**: Self-hosted, your data stays on your infrastructure
4. **Flexibility**: Route to any agent, use custom skills, integrate with your workflow
5. **Multi-Agent**: Your whole team of specialized agents, accessible from Slack

## Roadmap

- [x] Slack ↔ Claude Code agent messaging
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

Slack text is untrusted input to an AI agent. Messages from senders not listed in `OPERATOR_SLACK_IDS` are delivered as `<external-content source="slack" sender="..." trust="none">` data blocks, with suspicious injection patterns called out inside the block. Set `OPERATOR_SLACK_IDS` to your own Slack user ID to keep plain messages for yourself.

See [SECURITY.md](./SECURITY.md) for security policy and reporting vulnerabilities.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Keywords

Claude Code, Slack integration, AI coding assistant, Claude Code skills, Claude Code hooks, Anthropic Claude, coding agents, AI pair programming, developer tools, team collaboration, Claude CLI, tmux, AI Maestro

## Credits

Based on [claude-code-slack-bot](https://github.com/mpociot/claude-code-slack-bot) by Marcel Pociot.

## Related Projects

- [AI Maestro](https://github.com/23blocks-OS/ai-maestro) - Dashboard for managing Claude Code agents
- [AI Maestro Documentation](https://23blocks-os.github.io/ai-maestro/) - Full documentation

## License

MIT - see [LICENSE](./LICENSE)

---

<p align="center">
  <b>Made with ❤️ by <a href="https://github.com/23blocks-OS">23blocks</a></b><br>
  <sub>Supercharge your Claude Code workflow with Slack integration</sub>
</p>
