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

# 2. Check build tools
echo "🔍 Checking dependencies (gcc, make, npm)..."
if ! command -v make &> /dev/null || ! command -v gcc &> /dev/null || ! command -v npm &> /dev/null; then
    echo "❌ Error: Missing build dependencies."
    echo "Please install build-essential/gcc, make, and Node.js/npm first."
    exit 1
fi

# 3. Build C Backend
echo "🔨 Building Core C Server..."
make clean
make

# 4. Build Next.js Dashboard
echo "🔨 Building Admin Dashboard (Next.js)..."
cd webapp
npm install --legacy-peer-deps
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
