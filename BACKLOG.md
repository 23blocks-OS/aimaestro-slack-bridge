# Slack-AI Maestro Bridge - Backlog

## ✅ Agent Routing via @AIM:agent-name (COMPLETED)

The bridge now supports routing to any agent in the AI Maestro mesh network using the `@AIM:agent-name` convention.

### Usage
```
@AIM:backend-api check the server status
@AIM:graph-query find all API endpoints
```

Messages without `@AIM:` prefix route to the default agent (configurable via `DEFAULT_AGENT` env var).

### Response Format
Responses are prefixed with the agent name:
```
🤖 [backend-api] Server is healthy, all endpoints responding.
```

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
- [x] **Agent routing via @AIM:agent-name** ✅
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
