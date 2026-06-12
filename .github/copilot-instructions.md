# Copilot Instructions: PPSSPP Adhoc Server

This is a single-threaded, non-blocking TCP lobby server for PPSSPP ad-hoc multiplayer games, written in C. It implements the PRO ONLINE binary protocol (opcode-based).

## Build & Test

### Build locally (macOS/Linux with GCC)
```bash
make                # Outputs: AdhocServer
make clean          # Remove .o files
```

### Build & run with Docker (recommended for CI)
```bash
docker build -t ppsspp-adhoc .
docker run --rm -p 27312:27312 \
  -v $(pwd)/database.db:/app/database.db \
  -v $(pwd)/www:/app/www \
  -it ppsspp-adhoc
```

### Run tests
```bash
# Automatic (builds Docker, runs server, tests, cleans up):
./tests/python/run_tests.sh

# Manual (requires running server separately):
python3 tests/python/test_server.py -v

# Single test:
python3 tests/python/test_server.py TestGroupOperations.test_join_group -v
```

Tests are Python stdlib only—no pip dependencies. See `tests/python/README.md` for test configuration and what each test class covers.

## Architecture: 3-Level Linked-List Data Model

```
_db_user (global list)
  └─ User 1 (prev/next globally, group_prev/group_next within group)
     └─ Game 1
        └─ Group 1 (users linked, last user = host → MAC becomes BSSID)
  └─ User 2
     └─ Game 2
        └─ Group 2
```

**Key insight:** 1 user = 1 game + 0 or 1 group. Players are doubly-linked within a group; the tail player (group_next==NULL) is the host.

### Protocol: TCP Port 27312

Opcode-based binary protocol. Common opcodes:
- `0x00` PING (1 byte)
- `0x01` LOGIN (144 bytes) — MAC + nickname + product code
- `0x02` CONNECT (C→S: 9 bytes, S→C: 139 bytes) — join group / notify peer
- `0x03` DISCONNECT (C→S: 1 byte, S→C: 5 bytes)
- `0x04` SCAN (list groups, C→S: 1 byte, S→C: 15 bytes per group)
- `0x07` CHAT (C→S: 65 bytes, S→C: 193 bytes)

See `src/packets.h` for all packet structures and `CLAUDE.md` for full protocol table.

### State Machine

```
TCP Accept
  → WAITING (timeout 15s) 
  → LOGIN received → LOGGED_IN
  → CONNECT/SCAN/CHAT/PING/timeout/RST → logout, free nodes
  → Within group: DISCONNECT → free group, stay logged in
```

Timeout is reset by PING. Idle timeout is 15 seconds.

## File Organization

| File | Responsibility |
|------|-----------------|
| `src/main.c` | Entry point, TCP accept loop, `usleep(1000)` event loop, opcode dispatch |
| `src/user.c` | User/Game/Group lifecycle, RX buffer management, handlers |
| `src/user.h` | Data structures (SceNetAdhocctlUserNode, GameNode, GroupNode), extern DB vars, API declarations |
| `src/packets.h` | Opcode `#define` constants, all packet structs (C2S/S2C) |
| `src/pspstructs.h` | PSP types: `MacAddress` (6B), `GroupName` (8B), `Nickname` (128B) |
| `src/status.c` | XML status generation, SQLite game name lookup, XML escaping |
| `src/config.h` | Port, max users, timeout, DB path, status file path |

## Key Conventions & Patterns

### Memory Ownership & Cleanup
- **`_db_user` owns UserNodes**, `_db_game` owns GameNodes + GroupNodes
- **`logout_user()`** — frees UserNode + cascade-frees empty GameNodes
- **`disconnect_user()`** — frees empty GroupNodes
- No reference counting: count=0 → free immediately

### RX Buffer Protocol
- Each user has a 4KB RX buffer (`rxbuf`, `rxbuf_len`)
- After processing a complete packet, **always call `clear_user_rxbuf()`**
- Incomplete packets remain in buffer; next `recv()` appends more data
- If buffer fills without a complete packet → kick user

### Adding a New Opcode (follow this order)
1. **`src/packets.h`** — Define `#define OPCODE_XXX 0xYY` + add C2S and S2C struct (if applicable)
2. **`src/main.c`** — Add `else if (opcode == OPCODE_XXX)` in the logged-in handler
3. **`src/user.c`** — Implement the handler function
4. **`src/user.h`** — Declare the handler function
5. **Handler must call `clear_user_rxbuf()`** after extracting the packet

Example: To add LOGIN, declare `void handle_login(SceNetAdhocctlUserNode *user);` in `user.h`, implement in `user.c`, then add dispatch in `main.c`.

### Socket Non-Blocking & Error Handling
- All client sockets are non-blocking (`fcntl(..., O_NONBLOCK)`)
- `recv()` returns `EAGAIN` when no data → loop continues
- `send()` may return partial byte count → currently **not handled** (known bug, see P0.2 in CLAUDE.md)

## Known Issues & Planned Fixes

See `CLAUDE.md` for a prioritized roadmap:

- **P0.1** (1 hour) — SIGPIPE crash: add `signal(SIGPIPE, SIG_IGN)` + wrap sends with `MSG_NOSIGNAL`
- **P0.2** (3 hours) — Partial send corruption: implement per-user TX buffer + `POLLOUT` flushing
- **P1.3** (4 hours) — Replace busy-loop `usleep(1000)` with `poll()` for 100-user scale
- **P1.4** (30 min) — Add `#include <unistd.h>` for macOS portability
- **P1.5** (2 hours) — Env config: `ADHOC_PORT`, `ADHOC_MAX_USERS`, `ADHOC_TIMEOUT`, `ADHOC_DB_PATH`
- **P1.6** (1 hour) — Validate database on startup (auto-create tables if missing)

## Deeper Context

For detailed architecture diagrams, protocol full spec, and bug investigation notes, see `CLAUDE.md`.

For feature recommendations and migration plans, see `docs/`.
