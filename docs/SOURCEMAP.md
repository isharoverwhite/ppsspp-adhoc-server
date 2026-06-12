# Sourcemap — PPSSPP Ad-Hoc Server

## 1. Project Overview

| Attribute | Value |
|-----------|-------|
| Name | PPSSPP Ad-Hoc Server (PRO ONLINE fork) |
| Language | C (C89/ANSI style, no C99 features) |
| Lines of Code | ~1,100 (394 main.c + 917 user.c + 263 status.c + headers) |
| Build System | GNU Make (Linux only — không build được trên macOS) |
| Build Cách Dùng | `docker build -t ppsspp-adhoc .` |
| Dependencies | SQLite3 (libsqlite3), POSIX sockets |
| Transport | TCP, port 27312 |
| Pattern | Single-threaded, non-blocking I/O, event loop |
| Container | Multi-stage Docker (Alpine 3.12, GCC for build) |
| License | GPLv3 |
| Bug Đã Biết | SIGPIPE có thể giết server; send() không check return; IP dedup chặn NAT |

## 2. Module Dependency Graph

```
                    main.c
                   /  |   \
                  /   |    \
            user.h   status.h  config.h
            /    \      |
      packets.h  pspstructs.h
          |           |
     (opcodes +   (SceNetEtherAddr,
      structs)     SceNetAdhocctlGroupName,
                    SceNetAdhocctlNickname)
```

Compilation units:
- `main.c` → `main.o` (depends on: `user.h`, `status.h`, `config.h`)
- `user.c` → `user.o` (depends on: `user.h`, `status.h`, `config.h`, `sqlite3.h`)
- `status.c` → `status.o` (depends on: `user.h`, `status.h`, `config.h`, `sqlite3.h`)

## 3. Detailed Source Map

### 3.1 `src/main.c` — Entry Point & Event Loop (394 lines)

```
main()                                [L51-83]    Entry: signal setup, socket creation, main loop
  ├── interrupt()                     [L89-96]    SIGINT/SIGTERM handler: sets _status=0
  ├── create_listen_socket()          [L137-183]  TCP socket + bind + listen
  │   ├── enable_address_reuse()      [L102-109]  SO_REUSEADDR
  │   ├── change_blocking_mode()      [L116-130]  O_NONBLOCK toggle via fcntl
  │   └── bind/listen on SERVER_PORT (27312)
  └── server_loop()                   [L190-393]  Main event loop
      ├── [ACCEPT PHASE]              [L202-228]  accept()+login_user_stream() until EAGAIN
      │   └── change_blocking_mode() to nonblocking per connection
      ├── [RECEIVE PHASE]             [L231-379]  Iterate _db_user linked list
      │   ├── recv() into user->rx buffer
      │   ├── Connection death check  [L241-244]  recv==0, error, or timeout → logout_user()
      │   ├── STATE_WAITING handler   [L261-289]  Only OPCODE_LOGIN accepted
      │   └── STATE_LOGGED_IN handler [L293-373]
      │       ├── OPCODE_PING         [L296-299]  Consume 1 byte, reset death clock
      │       ├── OPCODE_CONNECT      [L302-320]  Parse group name → connect_user()
      │       ├── OPCODE_DISCONNECT   [L323-329]  1 byte → disconnect_user()
      │       ├── OPCODE_SCAN         [L332-340]  1 byte → send_scan_results()
      │       ├── OPCODE_CHAT         [L343-362]  64B message → spread_message()
      │       └── INVALID OPCODE      [L365-373]  Log + logout_user()
      └── [SLEEP]                     [L382]      usleep(1000) — 1ms idle

Shutdown (L385-392):
  free_database() → close(server) → return 0
```

### 3.2 `src/user.c` — User/Game/Group Lifecycle (917 lines)

```
Global Variables:
  _db_user_count          [L30]   uint32_t — total connected users
  _db_user                [L33]   SceNetAdhocctlUserNode* — head of user list
  _db_game                [L36]   SceNetAdhocctlGameNode* — head of game list

login_user_stream()       [L43-96]   TCP accept → allocate user node, IP dedup, link to _db_user
login_user_data()         [L103-187]  Validate login payload, find/create game, link user→game
logout_user()             [L193-256]  Unlink from _db_user + _db_game, close socket, free memory
free_database()           [L261-283]  Shutdown: broadcast SERVER_SHUTDOWN_MESSAGE, logout all
connect_user()            [L290-475]  Validate group name, find/create group, notify peers (OPCODE_CONNECT S2C), assign BSSID
disconnect_user()         [L481-575]  Notify peers (OPCODE_DISCONNECT S2C), unlink, free empty groups
send_scan_results()       [L581-649]  Iterate game groups, send OPCODE_SCAN + OPCODE_SCAN_COMPLETE
spread_message()          [L656-761]  NULL→global broadcast, user→group broadcast (OPCODE_CHAT S2C)
get_user_state()          [L767-777]  Check timeout (15s) vs game==NULL vs logged-in
clear_user_rxbuf()        [L784-794]  memmove remaining bytes, decrement rxpos
game_product_relink()     [L802-806]  Cross-region product code patching (unused in current code)
game_product_override()   [L812-915]  SQLite: check crosslinks table, auto-register unknown product codes
```

### 3.3 `src/status.c` — XML Status Logfile (263 lines)

```
update_status()           [L31-152]   Generate www/status.xml
  ├── SQLite lookup: product code → game name from productids table
  ├── Iterate _db_game → game nodes
  │   ├── Iterate group → group nodes + user list
  │   └── "Groupless" counter for idle players
  └── XML structure: <prometheus> → <game> → <group> → <user>

strcpyxml()               [L161-261]  XML entity escaper (&, <, >, ")
```

### 3.4 `src/packets.h` — Protocol Definitions (106 lines)

```
Opcode constants: 0x00-0x07
C2S structs:
  SceNetAdhocctlLoginPacketC2S       opcode(1) + mac(6) + name(128) + game(9) = 144 bytes
  SceNetAdhocctlConnectPacketC2S     opcode(1) + group(8) = 9 bytes
  SceNetAdhocctlChatPacketC2S        opcode(1) + message(64) = 65 bytes

S2C structs:
  SceNetAdhocctlConnectPacketS2C     opcode(1) + name(128) + mac(6) + ip(4) = 139 bytes
  SceNetAdhocctlDisconnectPacketS2C  opcode(1) + ip(4) = 5 bytes
  SceNetAdhocctlScanPacketS2C        opcode(1) + group(8) + mac(6) = 15 bytes
  SceNetAdhocctlConnectBSSIDPacketS2C opcode(1) + mac(6) = 7 bytes
  SceNetAdhocctlChatPacketS2C        opcode(1) + message(64) + name(128) = 193 bytes
```

### 3.5 `src/pspstructs.h` — PSP Primitive Types (40 lines)

```
SceNetEtherAddr            6 bytes (MAC address)
SceNetAdhocctlGroupName    8 bytes (alphanumeric group ID)
SceNetAdhocctlNickname     128 bytes (UTF-8 player name)
```

### 3.6 `src/config.h` — Server Constants (45 lines)

```
SERVER_PORT           27312
SERVER_LISTEN_BACKLOG 128
SERVER_USER_MAXIMUM   1024
SERVER_USER_TIMEOUT   15 (seconds)
SERVER_DATABASE       "database.db"
SERVER_STATUS_XMLOUT  "www/status.xml"
SERVER_SHUTDOWN_MSG   "PROMETHEUS HUB IS SHUTTING DOWN!"
```

### 3.7 `src/user.h` — User/Game/Group API + Data Structures (212 lines)

```
SceNetAdhocctlResolverInfo    mac + ip + name
SceNetAdhocctlUserNode        prev/next (global) + group_prev/group_next (intra-group) + resolver + game link + group link + stream fd + last_recv + rx[1024] + rxpos
SceNetAdhocctlGameNode        prev/next + product code + playercount + groupcount + group pointer
SceNetAdhocctlGroupNode       prev/next + game link + group name + playercount + player pointer
```

## 4. Constants & Magic Numbers

| Value | Location | Meaning |
|-------|----------|---------|
| 27312 | config.h | TCP port (same as original PRO ONLINE) |
| 128 | config.h | TCP backlog (max pending accepts) |
| 1024 | config.h | Max concurrent users |
| 15 | config.h | User inactivity timeout (seconds) |
| 1024 | user.h:rx[] | Fixed RX buffer per user |
| 64 | packets.h | Chat message max length |
| 128 | pspstructs.h | Nickname max length |
| 8 | pspstructs.h | Group name max length |
| 9 | pspstructs.h | Product code length (e.g., ULUS12345) |
| 1000 | main.c | usleep microseconds between event loops |
