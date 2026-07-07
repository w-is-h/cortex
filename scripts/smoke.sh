#!/usr/bin/env bash
# End-to-end curl smoke test against a running cortex server.
# Usage: scripts/smoke.sh [base_url]
set -euo pipefail

BASE="${1:-http://localhost:8000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

req() { # method path [json]
  local method="$1" path="$2" body="${3:-}"
  curl -sf -X "$method" "$BASE$path" -b "$JAR" -c "$JAR" \
       ${body:+-H 'Content-Type: application/json' -d "$body"}
}

echo "health:   $(req GET /api/health)"
req POST /api/auth/login '{"username": "admin"}' >/dev/null
echo "login:    ok ($(req GET /api/auth/me | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])'))"

SPRINT=$(req POST /api/sprints "{\"space_id\": 1, \"name\": \"smoke sprint\", \"start_date\": \"$(date +%F)\", \"end_date\": \"$(date -v+6d +%F 2>/dev/null || date -d '+6 days' +%F)\"}")
SPRINT_ID=$(echo "$SPRINT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "sprint:   #$SPRINT_ID"

PROJECT=$(req POST /api/projects "{\"space_id\": 1, \"title\": \"smoke project\", \"due_date\": \"$(date -v+30d +%F 2>/dev/null || date -d '+30 days' +%F)\"}")
PROJECT_ID=$(echo "$PROJECT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "project:  #$PROJECT_ID"

TASK=$(req POST /api/tasks "{\"space_id\": 1, \"title\": \"smoke task\", \"project_id\": $PROJECT_ID}")
TASK_ID=$(echo "$TASK" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "task:     #$TASK_ID (backlog)"

req POST /api/tasks/move "{\"task_ids\": [$TASK_ID], \"sprint_id\": $SPRINT_ID}" >/dev/null
echo "move:     task $TASK_ID -> sprint $SPRINT_ID"

req POST "/api/tasks/$TASK_ID/comments" '{"body": "smoke **comment**"}' >/dev/null
echo "comment:  ok"

BOARD_COUNT=$(req GET "/api/tasks?sprint_id=$SPRINT_ID" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
echo "board:    $BOARD_COUNT task(s) in sprint"

HITS=$(req GET "/api/search?q=smoke" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(len(r["tasks"]), len(r["projects"]), len(r["comments"]))')
echo "search:   hits (tasks projects comments): $HITS"

echo "smoke OK"
