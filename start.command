#!/bin/bash
# Фабрика Контента — Content Workbench
# Запуск локального сервера и открытие браузера

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

echo "🏭 Фабрика Контента v0.1.0"
echo "========================="

# Check node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Please install Node.js 20+"
  exit 1
fi

# Install if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install --legacy-peer-deps
fi

# Push DB schema
echo "🗄️  Running database migration..."
cd server && npx drizzle-kit push --config=drizzle.config.ts 2>/dev/null && cd ..

# Start server in background
echo "🚀 Starting server..."
node_modules/.bin/tsx server/src/index.ts &
SERVER_PID=$!
sleep 2

# Start frontend
echo "🌐 Opening app..."
node_modules/.bin/vite --config app/vite.config.ts app/ &
VITE_PID=$!

sleep 2
open http://localhost:5173

echo ""
echo "✅ Фабрика Контента running:"
echo "   http://localhost:5173   (UI)"
echo "   http://localhost:3001   (API)"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $SERVER_PID $VITE_PID 2>/dev/null; exit 0" INT TERM
wait
