#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server (Go Native) Installer    "
echo "================================================="

# Variables
TMP_DIR="/tmp/ppsspp-src"
INSTALL_DIR="/opt/ppsspp-adhoc-server"
REPO_URL="https://github.com/isharoverwhite/ppsspp-adhoc-server.git"

# Ensure script is run with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  WARNING: This script requires root privileges."
    echo "Please run: sudo bash $0"
    exit 1
fi

# 1. Check/Install Dependencies
echo "🔍 Checking dependencies (Go, Node.js, NPM, SQLite3)..."
MISSING_DEPS=0

if ! command -v go &> /dev/null; then MISSING_DEPS=1; fi
if ! command -v npm &> /dev/null; then MISSING_DEPS=1; fi
if ! command -v git &> /dev/null; then MISSING_DEPS=1; fi

if [ $MISSING_DEPS -eq 1 ]; then
    echo "📦 Attempting to automatically install missing dependencies..."
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y golang-go nodejs npm libsqlite3-dev build-essential git
    else
        echo "❌ Error: Could not detect 'apt-get'. Please install Go, Node.js, and Git manually."
        exit 1
    fi
fi

# 2. Clone repository to /tmp
echo "📥 Cloning repository to $TMP_DIR..."
rm -rf "$TMP_DIR"
git clone "$REPO_URL" "$TMP_DIR"
cd "$TMP_DIR"

# 3. Create install directory
echo "📂 Setting up installation directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/www"

# 4. Database Migration (Preserve old data)
echo "📦 Checking for existing database to migrate..."
OLD_DB_LOCATIONS=(
    "$INSTALL_DIR/database.db"
    "$INSTALL_DIR/data/database.db"
    "/root/ppsspp-adhoc-server/database.db"
    "/root/ppsspp-adhoc-server/data/database.db"
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
    touch "$INSTALL_DIR/data/database.db"
fi

# 5. Build Go Backend
echo "🔨 Building Go Server..."
cd "$TMP_DIR/src"
go mod tidy
go build -ldflags="-w -s" -o ppsspp-adhoc-go .

# STOP existing server before copying binary to avoid "Text file busy"
echo "🛑 Stopping existing server processes..."
systemctl stop ppsspp-adhoc 2>/dev/null || true
pkill -f "AdhocServer" || true
pkill -f "ppsspp-adhoc-go" || true
sleep 1

cp ppsspp-adhoc-go "$INSTALL_DIR/AdhocServer"

# 6. Build Next.js Dashboard
echo "🔨 Building Admin Dashboard (Next.js)..."
cd "$TMP_DIR/webapp"
npm install --legacy-peer-deps
# Use absolute path for Prisma to ensure it hits the migrated DB
echo "DATABASE_URL=\"file:$INSTALL_DIR/data/database.db\"" > .env
npx prisma generate
npx prisma db push
npm run build

# Copy webapp to /opt (including .next and node_modules for 'npm start')
echo "🚚 Installing dashboard files..."
rm -rf "$INSTALL_DIR/webapp"
mkdir -p "$INSTALL_DIR/webapp"
cp -a . "$INSTALL_DIR/webapp/"

# 7. Install Global CLI and Update Script
echo "🛠️ Installing global 'ppsspp' CLI tool..."
cp "$TMP_DIR/src/cli.sh" /usr/local/bin/ppsspp
chmod +x /usr/local/bin/ppsspp
cp "$TMP_DIR/update.sh" "$INSTALL_DIR/update.sh"
chmod +x "$INSTALL_DIR/update.sh"

# 8. Set up Systemd Service
echo "⚙️ Configuring Systemd service..."
cat << EOF > /etc/systemd/system/ppsspp-adhoc.service
[Unit]
Description=PPSSPP Ad-hoc Server & Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=DATABASE_PATH=$INSTALL_DIR/data/database.db
Environment=ADHOC_STATUS_PATH=$INSTALL_DIR/www/status.xml
# Run Go server in background and Next.js in foreground
ExecStart=/bin/bash -c "./AdhocServer & cd webapp && npm start"
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ppsspp-adhoc
systemctl restart ppsspp-adhoc

echo "================================================="
echo "🎉 Native Installation Complete!"
echo "🎮 Ad-hoc Server Port : 27312"
echo "📊 Admin Dashboard    : http://localhost:3000"
echo "💡 You can manage the service using 'ppsspp':"
echo "   - ppsspp status"
echo "   - ppsspp restart"
echo "   - ppsspp logs"
echo "   - ppsspp update"
echo "================================================="
