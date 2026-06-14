CC = gcc
SRC_DIR = ./src/
CFLAGS = -fpack-struct -I. -I$(SRC_DIR)
LIBS = -lsqlite3 -lpthread

OS := $(shell uname -s)
ifeq ($(OS),Darwin)
    CFLAGS += -I/opt/homebrew/opt/sqlite/include -I/usr/local/opt/sqlite/include
    LIBS += -L/opt/homebrew/opt/sqlite/lib -L/usr/local/opt/sqlite/lib
endif

OBJ = main.o user.o status.o http_server.o
TARGET = AdhocServer

.PHONY: all clean setup install uninstall

all: $(TARGET)

%.o: $(SRC_DIR)%.c
	$(CC) -c -o $@ $< $(CFLAGS)

$(TARGET): $(OBJ)
	$(CC) -o $@ $^ $(LIBS) $(CFLAGS)

clean:
	rm -rf *.o *~ $(TARGET)

setup:
	chmod +x setup.sh
	./setup.sh

install: all
	@echo "Installing AdhocServer to /usr/local/bin..."
	install -m 755 $(TARGET) /usr/local/bin/$(TARGET)
	
	@echo "Installing Webapp to /opt/adhoc-server..."
	mkdir -p /opt/adhoc-server
	touch database.db
	cp -r webapp database.db Makefile setup.sh /opt/adhoc-server/
	
	@echo "Setting up Node.js dependencies for Webapp..."
	cd /opt/adhoc-server/webapp && npm install --legacy-peer-deps && npx prisma db push && npm run build
	
	@echo "Installing Systemd Services..."
	install -m 644 adhoc-server.service /etc/systemd/system/
	install -m 644 adhoc-webapp.service /etc/systemd/system/
	
	systemctl daemon-reload
	systemctl enable adhoc-server.service
	systemctl enable adhoc-webapp.service
	systemctl restart adhoc-server.service
	systemctl restart adhoc-webapp.service
	
	@echo "Installation complete! Services are running in the background."

uninstall:
	@echo "Stopping and removing services..."
	-systemctl stop adhoc-server.service
	-systemctl stop adhoc-webapp.service
	-systemctl disable adhoc-server.service
	-systemctl disable adhoc-webapp.service
	rm -f /etc/systemd/system/adhoc-server.service
	rm -f /etc/systemd/system/adhoc-webapp.service
	systemctl daemon-reload
	
	@echo "Removing binaries and webapp..."
	rm -f /usr/local/bin/$(TARGET)
	rm -rf /opt/adhoc-server
	
	@echo "Uninstall complete. Note: /etc/adhoc-server config was left intact for backups."
