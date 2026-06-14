#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server & Dashboard Installer    "
echo "================================================="

# 1. Clone or Update repository
INSTALL_DIR="$HOME/ppsspp-adhoc-server"
if [ ! -f "src/main.c" ]; then
    echo "📥 Getting latest code..."
    if [ -d "$INSTALL_DIR" ]; then
        echo "♻️ Directory already exists. Updating..."
        cd "$INSTALL_DIR"
        git pull origin master
    else
        echo "📥 Cloning repository to $INSTALL_DIR..."
        git clone https://github.com/isharoverwhite/ppsspp-adhoc-server.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
else
    INSTALL_DIR="$(pwd)"
fi

# 2. Check build tools and dependencies
echo "🔍 Checking dependencies (gcc, make, npm, sqlite3 headers)..."
MISSING_DEPS=0

if ! command -v make &> /dev/null || ! command -v gcc &> /dev/null; then
    echo "❌ Error: Missing build-essential (gcc, make)."
    MISSING_DEPS=1
fi

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
        sudo apt-get update
        sudo apt-get install -y build-essential libsqlite3-dev nodejs npm
    elif command -v yum &> /dev/null; then
        echo "🐧 Detected CentOS/RHEL. Installing packages via yum..."
        sudo yum groupinstall -y 'Development Tools'
        sudo yum install -y sqlite-devel nodejs npm
    elif command -v brew &> /dev/null; then
        echo "🍎 Detected macOS. Installing packages via brew..."
        brew install sqlite node
    else
        echo "❌ Error: Could not detect supported package manager (apt/yum/brew)."
        echo "Please install dependencies manually: gcc, make, sqlite3 headers, nodejs, npm"
        exit 1
    fi
    echo "✅ Dependencies installed successfully!"
fi

# 3. Build C Backend
echo "🔨 Building Core C Server..."
make clean
make

# 4. Build Next.js Dashboard
echo "🔨 Building Admin Dashboard (Next.js)..."
cd webapp
npm install --legacy-peer-deps

# Provide default DATABASE_URL for Prisma during build
echo "DATABASE_URL=\"file:../database.db\"" > .env

npx prisma generate
npm run build
cd ..

# 5. Create a combined launcher script
echo "📝 Creating start-all.sh script..."
cat << 'EOF' > start-all.sh
#!/bin/bash
cd "$(dirname "$0")"

echo "Starting C Server on port 27312..."
./AdhocServer &
SERVER_PID=$!

echo "Starting Next.js WebApp on port 3000..."
cd webapp
npm start &
WEBAPP_PID=$!

trap "kill $SERVER_PID $WEBAPP_PID" EXIT
wait
EOF
chmod +x start-all.sh

# 6. Install as a Systemd service (Linux only)
if [ -d /etc/systemd/system ]; then
    echo "⚙️ Installing Systemd service..."
    cat << EOF | sudo tee /etc/systemd/system/ppsspp-adhoc.service
[Unit]
Description=PPSSPP Ad-hoc Server & Admin Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/start-all.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable ppsspp-adhoc
    sudo systemctl restart ppsspp-adhoc
    echo "✅ Service 'ppsspp-adhoc' has been installed and started in the background."
else
    echo "⚠️ Systemd not found (You might be on macOS/Windows)."
    echo "You can start the server manually by running: ./start-all.sh"
fi

echo "================================================="
echo "🎉 Installation Complete!"
echo "🎮 Ad-hoc Server Port : 27312"
echo "📊 Admin Dashboard    : http://localhost:3000"
echo "📁 Install Directory  : $INSTALL_DIR"
echo "================================================="
