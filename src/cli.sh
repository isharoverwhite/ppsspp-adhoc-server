#!/bin/bash

# PPSSPP Ad-hoc Server CLI (Docker Edition)
# Installed automatically by the PPSSPP Server Installer

COMMAND=$1
ARGS=$2
INSTALL_DIR="/opt/ppsspp-adhoc-server"

# Auto-detect INSTALL_DIR if running from within the repo
if [ -f "./docker-compose.yaml" ]; then
    INSTALL_DIR="$(pwd)"
fi

if [ -z "$COMMAND" ]; then
    echo "Usage: ppsspp update"
    echo ""
    echo "Commands:"
    echo "  update    Pull the latest code from GitHub and rebuild the machine installation"
    exit 1
fi

cd "$INSTALL_DIR"

case "$COMMAND" in
    update)
        echo "🔄 Starting PPSSPP Ad-hoc Server update and rebuild process..."
        if [ -f "./update.sh" ]; then
            bash ./update.sh
        else
            # Fallback to install script if update.sh missing
            curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | bash
        fi
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        echo "Usage: ppsspp update"
        exit 1
        ;;
esac
