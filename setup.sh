#!/bin/bash

set -e

# Setup colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== PPSSPP Adhoc Server Setup ===${NC}"

# Ensure we run as root if we want to install system-wide
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./install.sh) if you want to install as a system service."
  echo "Press Enter to continue setup for local Docker/Testing, or Ctrl+C to abort."
  read -r
fi

# Define defaults
PORT=27312
MAX_USERS=1024
MAX_USERS_PER_IP=2
TIMEOUT=15
WEB_PORT=3000

# Use whiptail if available for a nice TUI, otherwise fallback to read
if command -v whiptail >/dev/null 2>&1; then
    whiptail --msgbox "Welcome to PPSSPP Adhoc Server Setup!\n\nThis wizard will configure the server options.\nNote: Game Server Port is strictly fixed to 27312 for PPSSPP compatibility." 10 60
    
    MAX_USERS=$(whiptail --inputbox "Enter Max Users allowed on server:" 8 60 "$MAX_USERS" --title "Max Users" 3>&1 1>&2 2>&3)
    MAX_USERS_PER_IP=$(whiptail --inputbox "Enter Max Connections per IP (Anti-Spam):" 8 60 "$MAX_USERS_PER_IP" --title "Max Connections per IP" 3>&1 1>&2 2>&3)
    TIMEOUT=$(whiptail --inputbox "Enter Player Timeout (seconds):" 8 60 "$TIMEOUT" --title "Timeout" 3>&1 1>&2 2>&3)
    WEB_PORT=$(whiptail --inputbox "Enter Admin Dashboard Port (HTTP):" 8 60 "$WEB_PORT" --title "Web Port" 3>&1 1>&2 2>&3)
else
    echo "Whiptail not found, falling back to text prompt."
    echo "Note: Game Server Port is strictly fixed to 27312 for PPSSPP compatibility."
    read -p "Enter Max Users allowed [$MAX_USERS]: " input; MAX_USERS=${input:-$MAX_USERS}
    read -p "Enter Max Connections per IP [$MAX_USERS_PER_IP]: " input; MAX_USERS_PER_IP=${input:-$MAX_USERS_PER_IP}
    read -p "Enter Player Timeout in seconds [$TIMEOUT]: " input; TIMEOUT=${input:-$TIMEOUT}
    read -p "Enter Admin Dashboard Port [$WEB_PORT]: " input; WEB_PORT=${input:-$WEB_PORT}
fi

# Validate inputs
if [ -z "$WEB_PORT" ] || [ -z "$MAX_USERS" ]; then
    echo "Setup cancelled or invalid input."
    exit 1
fi

# Create Configuration files
echo -e "${GREEN}Generating .env configuration...${NC}"

cat <<EOF > .env
# --- Server Config ---
ADHOC_PORT=$PORT
ADHOC_MAX_USERS=$MAX_USERS
ADHOC_MAX_USERS_PER_IP=$MAX_USERS_PER_IP
ADHOC_TIMEOUT=$TIMEOUT

# --- Webapp Config ---
PORT=$WEB_PORT
EOF

# Copy .env to webapp folder for Next.js to use
cp .env webapp/.env

# If running as root, install configuration system-wide
if [ "$EUID" -eq 0 ]; then
    echo -e "${GREEN}Installing configuration to /etc/adhoc-server...${NC}"
    mkdir -p /etc/adhoc-server
    cp .env /etc/adhoc-server/adhoc.env
    chmod 600 /etc/adhoc-server/adhoc.env
    echo "System configuration updated."
fi

echo -e "${BLUE}Setup complete!${NC}"
