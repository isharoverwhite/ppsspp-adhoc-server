#!/bin/bash

# PPSSPP Ad-hoc Server CLI
# Installed automatically by the PPSSPP Server Installer

COMMAND=$1
ARGS=$2

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
    echo "  logs      Show server logs (use 'ppsspp logs web' for Next.js logs)"
    echo "  update    Pull the latest code from GitHub and update"
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
        if [ "$ARGS" == "web" ]; then
            tail -f /opt/ppsspp-adhoc-server/webapp/nextjs.log
        else
            sudo journalctl -u ppsspp-adhoc -f
        fi
        ;;
    update)
        echo "🔄 Starting PPSSPP Ad-hoc Server update process..."
        curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | bash
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        echo "Usage: ppsspp {start|stop|restart|status|enable|disable|logs|update}"
        exit 1
        ;;
esac
