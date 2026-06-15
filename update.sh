#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server (Go Native) Updater      "
echo "================================================="

INSTALL_DIR="/opt/ppsspp-adhoc-server"

# Ensure script is run with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  WARNING: This script requires root privileges."
    echo "Please run: sudo bash \$0"
    exit 1
fi

cd "$INSTALL_DIR"

# Check if it's a git repo (Native Install usually clones it)
if [ -d "webapp/.git" ] || [ -d ".git" ]; then
    echo "📥 Pulling latest changes from GitHub..."
    git pull origin master
fi

# Rebuild Backend
echo "🔨 Rebuilding Go Server..."
cd src
go mod tidy
go build -ldflags="-w -s" -o ppsspp-adhoc-go .
cp ppsspp-adhoc-go "$INSTALL_DIR/AdhocServer"
cd ..

# Rebuild Dashboard
echo "🔨 Rebuilding Admin Dashboard (Next.js)..."
cd webapp
npm install --legacy-peer-deps
npx prisma generate
npm run build
cd ..

# Restart Service
echo "🚀 Restarting Systemd service..."
systemctl restart ppsspp-adhoc

echo "================================================="
echo "🎉 Update and Rebuild Complete!"
echo "🔄 Server and Dashboard have been restarted."
echo "================================================="
