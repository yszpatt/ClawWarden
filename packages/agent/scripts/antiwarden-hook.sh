#!/bin/bash
# AntiWarden Hook Script for Claude Code
# This script is called by Claude Code hooks to update task status
#
# Environment variables:
#   ANTIWARDEN_TASK_ID - The task ID (injected by pty-manager)
#   ANTIWARDEN_API_URL - API base URL (optional, defaults to localhost:4001)
#
# Usage:
#   antiwarden-hook.sh stop     - Called when user stops the task (Ctrl+C)
#   antiwarden-hook.sh complete - Called when task completes normally

set -e

TASK_ID="${ANTIWARDEN_TASK_ID}"
API_URL="${ANTIWARDEN_API_URL:-http://localhost:4001}"

# Exit silently if not an AntiWarden task
if [ -z "$TASK_ID" ]; then
    exit 0
fi

HOOK_TYPE="${1:-stop}"

log() {
    echo "[AntiWarden Hook] $1" >&2
}

case "$HOOK_TYPE" in
    "stop")
        log "Task $TASK_ID stopped by user"
        curl -s -X POST "$API_URL/api/hooks/task-stopped" \
            -H "Content-Type: application/json" \
            -d "{\"taskId\": \"$TASK_ID\"}" > /dev/null 2>&1 || true
        ;;
    "complete")
        log "Task $TASK_ID completed, moving to pending-merge"
        curl -s -X POST "$API_URL/api/hooks/task-complete" \
            -H "Content-Type: application/json" \
            -d "{\"taskId\": \"$TASK_ID\", \"moveTo\": \"pending-merge\"}" > /dev/null 2>&1 || true
        ;;
    "failed")
        log "Task $TASK_ID failed"
        curl -s -X POST "$API_URL/api/hooks/task-failed" \
            -H "Content-Type: application/json" \
            -d "{\"taskId\": \"$TASK_ID\"}" > /dev/null 2>&1 || true
        ;;
    *)
        log "Unknown hook type: $HOOK_TYPE"
        exit 1
        ;;
esac

exit 0
