#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server (Golang) Installer       "
echo "   Powered by Docker Monolith Architecture       "
echo "================================================="

# Variables
TMP_DIR="/tmp/ppsspp-src"
INSTALL_DIR="/opt/ppsspp-adhoc-server"
REPO_URL="https://github.com/isharoverwhite/ppsspp-adhoc-server.git"

# Ensure script is run with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  WARNING: This script requires root privileges."
    echo "Please run: sudo bash \$0"
    exit 1
fi

# 1. Check for Docker
echo "🔍 Checking dependencies (Docker, Docker Compose)..."
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose V2 is required. Please update Docker."
    exit 1
fi

# 2. Clone repository to /tmp
echo "📥 Cloning repository to $TMP_DIR..."
rm -rf "$TMP_DIR"
git clone "$REPO_URL" "$TMP_DIR"
cd "$TMP_DIR"

# 3. Create install directory
echo "📂 Setting up installation directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR/data"

# 4. Database Migration (Preserve old data)
echo "📦 Checking for existing database to migrate..."
OLD_DB_LOCATIONS=(
    "$INSTALL_DIR/database.db"
    "$INSTALL_DIR/webapp/prisma/database.db"
    "/root/ppsspp-adhoc-server/database.db"
    "./database.db"
)

MIGRATED=0
for loc in "${OLD_DB_LOCATIONS[@]}"; do
    if [ -f "$loc" ] && [ ! -f "$INSTALL_DIR/data/database.db" ]; then
        echo "✅ Found old database at $loc. Migrating..."
        cp "$loc" "$INSTALL_DIR/data/database.db"
        MIGRATED=1
        break
    fi
done

if [ $MIGRATED -eq 0 ] && [ ! -f "$INSTALL_DIR/data/database.db" ]; then
    echo "ℹ️  No existing database found. A new one will be created."
    touch "$INSTALL_DIR/data/database.db"
fi

# 5. Clean up legacy Systemd services
echo "🧹 Cleaning up legacy C/Node.js services..."
systemctl stop ppsspp-adhoc 2>/dev/null || true
systemctl disable ppsspp-adhoc 2>/dev/null || true
rm -f /etc/systemd/system/ppsspp-adhoc.service

# 6. Copy files to /opt
echo "🚚 Installing files to $INSTALL_DIR..."
cp docker-compose.yaml "$INSTALL_DIR/"
cp Dockerfile "$INSTALL_DIR/"
cp update.sh "$INSTALL_DIR/"
cp -r go-server "$INSTALL_DIR/"
cp -r webapp "$INSTALL_DIR/"
cp -r src "$INSTALL_DIR/"
cp setup.sh "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/setup.sh"
chmod +x "$INSTALL_DIR/update.sh"

# 7. Install Global CLI
echo "🛠️ Installing global 'ppsspp' CLI tool..."
cp "$INSTALL_DIR/src/cli.sh" /usr/local/bin/ppsspp
chmod +x /usr/local/bin/ppsspp

# 8. Run Setup (Optional prompts)
cd "$INSTALL_DIR"
./setup.sh

# 9. Build Docker Image
echo "🚀 Building server image (this may take a few minutes)..."
docker compose build --pull

echo "================================================="
echo "🎉 Installation Complete!"
echo "📂 Files installed at : $INSTALL_DIR"
echo "📦 Docker image built : ppsspp-adhoc:latest"
echo "💡 To start the server, run:"
echo "   cd $INSTALL_DIR && docker compose up -d"
echo ""
echo "🛠️ You can also use the 'ppsspp' command for updates:"
echo "   - ppsspp update"
echo "================================================="
