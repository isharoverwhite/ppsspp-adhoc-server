# PPSSPP Ad-hoc Server (Go Native & Next.js Webapp)

SERVER_DIR = ./src
WEBAPP_DIR = ./webapp
TARGET = AdhocServer

.PHONY: all server webapp clean setup test install uninstall

all: server webapp

server: $(TARGET)

$(TARGET):
	@echo "Building Go AdhocServer..."
	cd $(SERVER_DIR) && go build -ldflags="-w -s" -o ../$(TARGET) .

webapp:
	@echo "Building Next.js Webapp..."
	cd $(WEBAPP_DIR) && npm run build

test: server
	@echo "Running test suite..."
	./tests/python/run_tests.sh

setup:
	chmod +x setup.sh
	./setup.sh

install: server webapp
	@echo "Installing AdhocServer to /usr/local/bin..."
	install -m 755 $(TARGET) /usr/local/bin/$(TARGET)
	@echo "Installing Webapp to /opt/ppsspp-adhoc-server..."
	mkdir -p /opt/ppsspp-adhoc-server/data
	cp -r $(WEBAPP_DIR) /opt/ppsspp-adhoc-server/
	install -m 755 $(SERVER_DIR)/cli.sh /usr/local/bin/ppsspp

clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(TARGET) *.o *.log
