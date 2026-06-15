#!/bin/bash

# PPSSPP Ad-hoc Server CLI (Native Systemd Edition)
# Installed automatically by the PPSSPP Server Installer

COMMAND=$1
ARGS=$2
INSTALL_DIR="/opt/ppsspp-adhoc-server"

if [ -z "$COMMAND" ]; then
    echo "Usage: ppsspp {start|stop|restart|status|enable|disable|logs|update}"
    echo ""
    echo "Commands:"
    echo "  start     Start the server and dashboard"
    echo "  stop      Stop the server and dashboard"
    echo "  restart   Restart both services"
    echo "  status    Check if services are running"
    echo "  enable    Enable auto-start on boot"
    echo "  disable   Disable auto-start on boot"
    echo "  logs      Show server logs"
    echo "  update    Pull latest code and rebuild natively"
    exit 1
fi

case "$COMMAND" in
    start)
        sudo systemctl start ppsspp-adhoc
        echo "✅ PPSSPP Ad-hoc Server started."
        ;;
    stop)
        sudo systemctl stop ppsspp-adhoc
        echo "🛑 PPSSPP Ad-hoc Server stopped."
        ;;
    restart)
        sudo systemctl restart ppsspp-adhoc
        echo "🔄 PPSSPP Ad-hoc Server restarted."
        ;;
    status)
        sudo systemctl status ppsspp-adhoc
        ;;
    enable)
        sudo systemctl enable ppsspp-adhoc
        echo "✅ PPSSPP Ad-hoc Server enabled on boot."
        ;;
    disable)
        sudo systemctl disable ppsspp-adhoc
        echo "🛑 PPSSPP Ad-hoc Server disabled on boot."
        ;;
    logs)
        sudo journalctl -u ppsspp-adhoc -f
        ;;
    update)
        echo "🔄 Starting PPSSPP Ad-hoc Server update and native rebuild..."
        if [ -f "$INSTALL_DIR/update.sh" ]; then
            sudo bash "$INSTALL_DIR/update.sh"
        else
            curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
        fi
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        echo "Usage: ppsspp {start|stop|restart|status|enable|disable|logs|update}"
        exit 1
        ;;
esac
