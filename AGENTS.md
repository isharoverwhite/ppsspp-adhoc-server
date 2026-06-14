# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Run (Docker)

```bash
# Cách 1: Dùng Docker Compose (Khuyên dùng)
docker-compose up -d --build

# Cách 2: Build & Run thủ công
docker build -t ppsspp-adhoc .

# Chạy với volume để persist dữ liệu và log
docker run --rm -p 27312:27312 \
  -v $(pwd)/database.db:/app/database.db \
  -v $(pwd)/www:/app/www \
  -it ppsspp-adhoc
```

CI: push `master` → build multi-arch (amd64+arm64) → `ghcr.io/souler/ppsspp-adhoc:latest`.

## Kiến Trúc

Single-threaded, non-blocking TCP lobby server cho PPSSPP ad-hoc multiplayer. Giao thức PRO ONLINE (binary, opcode-based).

### Mô Hình Dữ Liệu — 3 tầng linked list

```
_db_user → SceNetAdhocctlUserNode (prev/next toàn cục, group_prev/group_next trong group)
  └── game → SceNetAdhocctlGameNode (prev/next toàn cục, group → GroupNode)
       └── group → SceNetAdhocctlGroupNode (prev/next trong game, player → UserNode)
```

1 user = 1 game + 0 hoặc 1 group. Player cuối group (`group_next==NULL`) = host, MAC thành BSSID.

### Giao Thức (TCP 27312)

| Opcode | Hướng | Bytes | Mục đích |
|--------|-------|-------|----------|
| `0x00` PING | C→S | 1 | Keep-alive |
| `0x01` LOGIN | C→S | 144 | MAC + nickname + product code |
| `0x02` CONNECT | C→S | 9 | Join group (tên 8 ký tự) |
| `0x02` CONNECT | S→C | 139 | Notify peer: người mới join |
| `0x03` DISCONNECT | C→S | 1 | Rời group |
| `0x03` DISCONNECT | S→C | 5 | Notify peer: người rời |
| `0x04` SCAN | C→S | 1 | Liệt kê group |
| `0x04` SCAN | S→C | 15 | 1 packet/group: tên + host MAC |
| `0x05` SCAN_COMPLETE | S→C | 1 | Hết danh sách |
| `0x06` CONNECT_BSSID | S→C | 7 | Gán BSSID = MAC host |
| `0x07` CHAT | C→S | 65 | Tin nhắn 64 byte |
| `0x07` CHAT | S→C | 193 | Relay tin đến peer |

### State Machine

```
TCP Accept → WAITING → (LOGIN) → LOGGED_IN
                  ↓ timeout 15s → kick

LOGGED_IN → CONNECT → trong group → DISCONNECT → ngoài group
          → SCAN → nhận danh sách group
          → CHAT → relay đến peer (phải trong group)
          → PING → reset death clock
          → timeout 15s / TCP close / opcode lạ → kick
```

### File Map

| File | Vai trò |
|------|--------|
| `src/main.c` | Entry point, accept loop, event loop, dispatch opcode |
| `src/user.c` | User/Game/Group lifecycle, product override, RX buffer |
| `src/user.h` | Data structures, extern DB vars, API declarations |
| `src/status.c` | XML status + SQLite game name lookup + XML escape |
| `src/status.h` | `update_status()` |
| `src/packets.h` | Opcode constants + tất cả packet structs |
| `src/pspstructs.h` | PSP types: MAC (6B), GroupName (8B), Nickname (128B) |
| `src/config.h` | Port, max users, timeout, DB path, status path |

### Quy tắc bộ nhớ

- `_db_user` sở hữu UserNode, `_db_game` sở hữu GameNode + GroupNode
- `logout_user()` free UserNode + cascade free GameNode rỗng
- `disconnect_user()` free GroupNode rỗng
- Không reference counting — count=0 là free ngay

## Bug Đã Biết & Kế Hoạch Sửa

### P0 — Bắt buộc (có thể kill server hoặc làm lobby lệch)

**[DONE] P0.1: SIGPIPE giết server + `send()` không check return**
- Code gọi `send()` không kiểm tra → client RST/Wi-Fi rớt → `SIGPIPE` kill process
- **Sửa:** `signal(SIGPIPE, SIG_IGN)` + `send_all()` loop với `MSG_NOSIGNAL`

**[DONE] P0.2: Partial send làm packet bị cắt**
- Socket nonblocking, `send()` gửi 139 byte nhưng chỉ gửi được 60 → client nhận packet hỏng
- Với 100 users, chuyện xảy ra thường xuyên khi mạng chậm
- **Sửa:** Per-user TX buffer, `queue_send()` append khi EAGAIN, flush lại khi `POLLOUT`

### P1 — Scale mượt 100 users

**[DONE] P1.3: `poll()` thay `usleep(1000)` busy-loop**
- Hiện tại: 100 users × 1000 vòng/s = **100,000 recv()/s**, hầu hết trả EAGAIN
- `poll()`: kernel báo socket nào có dữ liệu thật, CPU ~0% idle

**[DONE] P1.4: Fix include cho portable**
- Thiếu `<unistd.h>` → build fail trên macOS (dev)

**[DONE] P1.5: Config qua env**
- `ADHOC_PORT`, `ADHOC_MAX_USERS`, `ADHOC_TIMEOUT`, `ADHOC_DB_PATH`, `ADHOC_MAX_USERS_PER_IP`

**[DONE] P1.6: Validate database lúc start**
- DB thiếu/sai path → crosslink sai mà không ai biết
- Auto-tạo bảng `productids`/`crosslinks` nếu thiếu

### P2 — Tối ưu thêm

| # | Mục | Thời gian |
|---|-----|-----------|
| P2.7 | Debounce status.xml (100 lần/giây → 1 lần/giây) | 1h |
| P2.8 | Signal handler: bỏ printf, chỉ set `volatile sig_atomic_t` | 15ph |
| P2.9 | Pipe EPIPE/ENXIO handle (nếu tích hợp Delph) | 1h |

**Tổng P0+P1 = ~12 giờ → server ổn định cho 100 users public.**

## Test Suite

```bash
# Tự động: build Docker + start server + test + cleanup
./tests/python/run_tests.sh

# Thủ công:
python3 tests/python/test_server.py -v

# 1 test cụ thể:
python3 tests/python/test_server.py TestGroupOperations.test_join_group -v
```

Test nằm trong `tests/python/`: `protocol.py` (thư viện giao thức) + `test_server.py` (18+ test case). Chỉ dùng stdlib, không cần pip.

## Cách Thêm Opcode Mới

1. `src/packets.h`: thêm `#define OPCODE_xxx` + struct C2S/S2C
2. `src/main.c`: thêm `else if` trong logged-in handler
3. `src/user.c`: implement handler, `src/user.h`: khai báo
4. Luôn gọi `clear_user_rxbuf()` sau khi xử lý xong packet
