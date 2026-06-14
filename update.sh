#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server & Dashboard Updater      "
echo "================================================="

# Get the installation directory
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$INSTALL_DIR"

echo "📥 Pulling latest changes from GitHub..."
git pull origin master

echo "🔨 Rebuilding Core C Server..."
make clean
make

echo "🔨 Rebuilding Admin Dashboard (Next.js)..."
cd webapp
npm install --legacy-peer-deps
echo "DATABASE_URL=\"file:../database.db\"" > .env
npx prisma generate
npx prisma db push
npm run build
cd ..

echo "🔄 Restarting services..."
if [ -d /etc/systemd/system ] && systemctl list-unit-files | grep -q ppsspp-adhoc.service; then
    sudo systemctl restart ppsspp-adhoc
    echo "✅ Service 'ppsspp-adhoc' restarted successfully!"
else
    echo "⚠️ Systemd service not found. You might need to restart the server manually."
    echo "Run: pkill -f AdhocServer; pkill -f 'npm start'; ./start-all.sh"
fi

echo "================================================="
echo "🎉 Update Complete!"
echo "================================================="
