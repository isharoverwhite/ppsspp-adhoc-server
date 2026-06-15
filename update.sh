#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server (Golang) Updater         "
echo "================================================="

INSTALL_DIR="/opt/ppsspp-adhoc-server"

# Auto-detect if running from within the repo
if [ -f "./docker-compose.yaml" ]; then
    INSTALL_DIR="$(pwd)"
fi

cd "$INSTALL_DIR"

echo "📥 Pulling latest changes from GitHub..."
git pull origin master

echo "🔨 Rebuilding Docker images..."
docker compose build --pull

echo "🧹 Cleaning up old Docker images..."
docker image prune -f

echo "================================================="
echo "🎉 Update and Rebuild Complete!"
echo "💡 To apply changes, manually restart your containers:"
echo "   cd $INSTALL_DIR && docker compose up -d"
echo "================================================="
