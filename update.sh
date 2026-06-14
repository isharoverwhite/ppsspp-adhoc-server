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

echo "📦 Seeding game names into database..."
npx prisma db seed

npm run build
cd ..

echo "📝 Updating start-all.sh script..."
# Capture actual paths
NODE_PATH=$(dirname $(command -v node))
NPM_PATH=$(dirname $(command -v npm))

cat << EOF > start-all.sh
#!/bin/bash
export PATH="\$PATH:$NODE_PATH:$NPM_PATH"

cd "\$(dirname "\$0")"

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
chmod +x start-all.sh

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
