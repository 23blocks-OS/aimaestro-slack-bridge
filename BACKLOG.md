# Slack-AI Maestro Bridge - Backlog

## Agent Routing via @AIM:agent-name

### Problem
Currently the bridge only routes messages to Lola (`pas-lola`). Users should be able to message any AI Maestro agent across the network from Slack.

### Solution
Parse messages for `@AIM:agent-name` convention and route to the specified agent.

### Convention
```
@AIM:agent-name message here
```

### Behavior

| Input | Routes To | Notes |
|-------|-----------|-------|
| `@AIM:backend-api check status` | backend-api | Explicit routing |
| `@AIM:crm-api sync data` | crm-api | Explicit routing |
| `Hey, how are things?` | pas-lola | Default (no @AIM) |
| `@AIM:unknown-agent hello` | Error message | Agent not found |

### Response Format
Prefix responses with the responding agent's name for clarity:
```
User: "@AIM:backend-api check the server"
Bot:  "🤖 [backend-api] Server is healthy, all endpoints responding."
```

### Implementation

1. **Parse incoming message** for `@AIM:(\w+[-\w]*)` pattern
2. **Validate agent exists** via AI Maestro API (`/api/agents`)
3. **Route message** to target agent (uses existing smart lookup for cross-host)
4. **On response**, prefix with agent name: `🤖 [agent-name] response`
5. **Default to Lola** if no `@AIM:` found

### Edge Cases
- Agent not found → Reply with error: "Agent 'xyz' not found. Available: ..."
- Multiple @AIM mentions → Route to first one? Or error?
- Agent on different host → Smart lookup handles this already

### Files to Modify
- `src/slack-maestro-bridge.ts`: Add routing logic, update response formatting

### Estimate
~2-3 hours

---

## Multi-Workspace Support

### Problem
Currently the bridge connects to a single Slack workspace. Each workspace requires its own Bot Token (`xoxb-...`).

### Options

**Option A: Multiple Bridge Instances**
- Run separate bridge processes per workspace
- Each with its own `.env` file (`.env.workspace1`, `.env.workspace2`, etc.)
- Simple but requires managing multiple processes

**Option B: Single Bridge, Multiple Tokens**
- Modify bridge to accept array of workspace configs
- Single process handles all workspaces
- More complex but cleaner operationally

### Steps to Add a Workspace
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Settings → Manage Distribution → Enable distribution
3. Install to Another Workspace
4. Get new Bot Token (`xoxb-...`)
5. Configure and run bridge for that workspace

---

## Future Improvements

### High Priority
- [ ] **Agent routing via @AIM:agent-name** (see above) ⭐
- [ ] Multi-workspace support (see above)
- [ ] PM2 or systemd service for persistent running
- [ ] Better error handling for rate limits (429)
- [ ] Retry logic with exponential backoff

### Medium Priority
- [ ] Message queue to prevent rate limiting
- [ ] Slack thread context preservation across sessions
- [ ] File/image attachment support
- [ ] Slash commands (`/lola help`)

### Low Priority
- [ ] Web dashboard for bridge status
- [ ] Message history/logging
- [ ] Per-channel or per-user preferences
- [ ] Scheduled messages

---

## Known Issues

- [ ] 429 rate limiting - need to investigate source and add throttling
