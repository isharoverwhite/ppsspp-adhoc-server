#!/bin/bash
set -e

echo "================================================="
echo "   PPSSPP Ad-hoc Server (Go Native) Updater      "
echo "================================================="

# Native Update strategy: Just re-run the installer.
# The installer handles cloning fresh code to /tmp, rebuilding,
# and restarting the systemd services.

echo "🔄 Re-running installation script to pull latest code and rebuild..."
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
