#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$SCRIPT_DIR/fabrika-server-macos"
APP_DIR="$SCRIPT_DIR/app"
PORT=3001

check_update() {
  CURRENT=$(cat "$SCRIPT_DIR/version.txt" 2>/dev/null || echo "0.0.0")
  LATEST=$(curl -s "https://api.github.com/repos/USERNAME/fabrika-content-workbench/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/' 2>/dev/null || echo "")
  if [ -n "$LATEST" ] && [ "$LATEST" != "$CURRENT" ]; then
    osascript -e "display notification \"Доступна версия $LATEST. Скачайте на сайте.\" with title \"Фабрика Контента\""
  fi
}
check_update &

pkill -f "fabrika-server-macos" 2>/dev/null || true

"$SERVER" &
SERVER_PID=$!

sleep 2
for i in {1..10}; do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

open "http://localhost:$PORT"

wait $SERVER_PID
