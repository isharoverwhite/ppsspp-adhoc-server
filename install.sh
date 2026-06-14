#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server & Dashboard Installer    "
echo "================================================="

# Variables
TMP_DIR="/tmp/ppsspp-src"
INSTALL_DIR="/opt/ppsspp-adhoc-server"
OLD_DIR="$HOME/ppsspp-adhoc-server"

# Ensure script is run with sudo if possible, or request it later for systemd/opt
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  WARNING: This script requires root privileges to install globally to /opt and /usr/local/bin."
    echo "Please run: sudo bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh)\""
    exit 1
fi

# 1. Clone repository to /tmp
echo "📥 Cloning repository to $TMP_DIR..."
rm -rf "$TMP_DIR"
git clone https://github.com/isharoverwhite/ppsspp-adhoc-server.git "$TMP_DIR"
cd "$TMP_DIR"

# 2. Check dependencies
echo "🔍 Checking dependencies (gcc, make, npm)..."
MISSING_DEPS=0

if ! command -v npm &> /dev/null; then
    echo "❌ Error: Missing Node.js (npm)."
    MISSING_DEPS=1
fi

if ! echo "#include <sqlite3.h>" | gcc -E - > /dev/null 2>&1; then
    echo "❌ Error: Missing SQLite3 development headers."
    MISSING_DEPS=1
fi

if [ $MISSING_DEPS -eq 1 ]; then
    echo "📦 Attempting to automatically install missing dependencies..."
    if command -v apt-get &> /dev/null; then
        echo "🐧 Detected Debian/Ubuntu. Installing packages via apt..."
        apt-get update
        apt-get install -y build-essential libsqlite3-dev nodejs npm
    elif command -v yum &> /dev/null; then
        echo "🐧 Detected CentOS/RHEL. Installing packages via yum..."
        yum groupinstall -y 'Development Tools'
        yum install -y sqlite-devel nodejs npm
    else
        echo "❌ Error: Could not detect supported package manager (apt/yum)."
        echo "Please install dependencies manually: gcc, make, sqlite3 headers, nodejs, npm"
        exit 1
    fi
    echo "✅ Dependencies installed successfully!"
fi

# 3. Create install directory and migrate old database if exists
echo "📂 Setting up installation directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

if [ -f "$OLD_DIR/database.db" ] && [ ! -f "$INSTALL_DIR/database.db" ]; then
    echo "📦 Migrating old database from $OLD_DIR..."
    cp "$OLD_DIR/database.db" "$INSTALL_DIR/"
fi

# 4. Build C Backend
echo "🔨 Building Core C Server..."
make clean
make

# 5. Build Next.js Dashboard
echo "🔨 Building Admin Dashboard (Next.js)..."
cd webapp
npm install --legacy-peer-deps

# Provide absolute DATABASE_URL for Prisma
echo "DATABASE_URL=\"file:$INSTALL_DIR/database.db\"" > .env

npx prisma generate
npx prisma db push

echo "📦 Seeding game names into database..."
npx prisma db seed

npm run build
cd ..

# 6. Install files to /opt
echo "🚚 Moving files to $INSTALL_DIR..."
# Stop service if it's currently running to avoid file lock issues
systemctl stop ppsspp-adhoc 2>/dev/null || true

cp AdhocServer "$INSTALL_DIR/"
rm -rf "$INSTALL_DIR/webapp"
cp -r webapp "$INSTALL_DIR/"

# 7. Create a combined launcher script in /opt
echo "📝 Creating start-all.sh script..."
# Capture actual paths
NODE_PATH=$(dirname $(command -v node))
NPM_PATH=$(dirname $(command -v npm))

cat << EOF > "$INSTALL_DIR/start-all.sh"
#!/bin/bash
export PATH="\$PATH:$NODE_PATH:$NPM_PATH"

cd "$INSTALL_DIR"

echo "Starting C Server on port 27312..."
./AdhocServer &
SERVER_PID=\$!

echo "Starting Next.js WebApp on port 3000..."
cd webapp
npm start > nextjs.log 2>&1 &
WEBAPP_PID=\$!

trap "kill \$SERVER_PID \$WEBAPP_PID" EXIT
wait
EOF
chmod +x "$INSTALL_DIR/start-all.sh"

# Set permissions
chown -R root:root "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# 8. Install Global CLI
echo "🛠️ Installing global 'ppsspp' CLI tool..."
cp src/cli.sh /usr/local/bin/ppsspp
chmod +x /usr/local/bin/ppsspp

# 9. Install as a Systemd service (Linux only)
if [ -d /etc/systemd/system ]; then
    echo "⚙️ Configuring Systemd service..."
    cat << EOF > /etc/systemd/system/ppsspp-adhoc.service
[Unit]
Description=PPSSPP Ad-hoc Server & Admin Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/start-all.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable ppsspp-adhoc
    systemctl restart ppsspp-adhoc
    echo "✅ Service 'ppsspp-adhoc' has been installed and started."
else
    echo "⚠️ Systemd not found. You can start the server manually by running: $INSTALL_DIR/start-all.sh"
fi

# 10. Clean up temporary files
echo "🧹 Cleaning up temporary build files..."
rm -rf "$TMP_DIR"

echo "================================================="
echo "🎉 Installation Complete!"
echo "🎮 Ad-hoc Server Port : 27312"
echo "📊 Admin Dashboard    : http://localhost:3000"
echo "💡 You can now manage your server using the 'ppsspp' command:"
echo "   - ppsspp status"
echo "   - ppsspp logs"
echo "   - ppsspp logs web"
echo "   - ppsspp restart"
echo "   - ppsspp update"
echo "================================================="
