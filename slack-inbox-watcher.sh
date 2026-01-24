#!/bin/bash
# Slack Inbox Watcher - Injects messages into tmux session

AGENT="pas-lola"
API="http://127.0.0.1:23000"
POLL_INTERVAL=${POLL_INTERVAL:-5}
TMUX_TARGET=${TMUX_TARGET:-"pas-lola:0.0"}
NOTIFIED_IDS="/tmp/slack-notified-ids.txt"

log() {
  echo "[watcher] $1"
}

check_inbox() {
  local response=$(curl -s "${API}/api/messages?agent=${AGENT}&box=inbox&status=unread")
  local messages=$(echo "$response" | jq -r '.messages // []')
  local count=$(echo "$messages" | jq 'length')

  [ "$count" = "0" ] || [ "$count" = "null" ] && return

  echo "$messages" | jq -c '.[]' | while read -r msg; do
    local from=$(echo "$msg" | jq -r '.fromAlias // .from // "unknown"')
    local msg_id=$(echo "$msg" | jq -r '.id')

    [ "$from" != "slack-bot" ] && continue

    # Skip if already notified
    grep -q "^${msg_id}$" "$NOTIFIED_IDS" 2>/dev/null && continue

    # Fetch full message
    local full_msg=$(curl -s "${API}/api/messages?agent=${AGENT}&id=${msg_id}&box=inbox")
    local content_msg=$(echo "$full_msg" | jq -r '.content.message // ""')
    local slack_user=$(echo "$full_msg" | jq -r '.content.slack.user // "unknown"')
    local slack_channel=$(echo "$full_msg" | jq -r '.content.slack.channel // ""')
    local slack_thread=$(echo "$full_msg" | jq -r '.content.slack.thread_ts // ""')

    # Simple notification - no special characters
    tmux send-keys -t "$TMUX_TARGET" "echo '[SLACK] New message from ${slack_user} - check your inbox'"
    sleep 0.1
    tmux send-keys -t "$TMUX_TARGET" Enter

    log "Notified about message from ${slack_user}"

    # Track that we notified (don't mark as read - let agent read via skill)
    echo "$msg_id" >> "$NOTIFIED_IDS"
  done
}

main() {
  log "Starting - polling every ${POLL_INTERVAL}s, target: ${TMUX_TARGET}"
  while true; do
    check_inbox
    sleep "$POLL_INTERVAL"
  done
}

trap 'log "Stopped"; exit 0' INT TERM
main
