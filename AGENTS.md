# AGENTS.md

> [!IMPORTANT]
> **Mandatory Pre-Task Rule**: Always read [AGENTS.md](file:///Users/dinhtrungkien/Documents/GitHub/ppsspp-adhoc-server/AGENTS.md) before performing any task or responding to the user.

This file provides guidance to all AI agents when working with code in this repository.

## Kiến Trúc Dự Án (Go Native + Next.js Dashboard + Chiikawa Welcome Page)

Hệ thống bao gồm 3 thành phần chính:
1. **Public Welcome Page (`welcome/`)**: Giao diện chào mừng & hướng dẫn kết nối phong cách **Chiikawa Manga/Kawaii** trên cổng HTTP `80` dành cho người dùng public xem domain, port 27312, port offset 0, và hướng dẫn kết nối PPSSPP / Real PSP.
2. **Core Ad-Hoc Server (`src/`)**: Viết bằng **Golang** đa luồng (Goroutines), xử lý giao thức PRO ONLINE (nhị phân, opcode-based trên cổng TCP `27312`, admin UDP `27313`, JSON API `8080`).
3. **Admin & Analytics Dashboard (`webapp/`)**: Viết bằng **Next.js 16 (React, Tailwind CSS, Prisma, SQLite)**, quản lý máy chủ qua web trên cổng HTTP `3000`.

---

## Build & Run

### 1. Dùng Docker Compose (Khuyên dùng)
```bash
docker-compose up -d --build
```
CI tự động: push lên `master` / `main` → build multi-arch (amd64 + arm64) → đẩy lên `ghcr.io/isharoverwhite/ppsspp-adhoc-server:latest`.

### 2. Build & Chạy Natively (Local Dev)
```bash
# Build Go Server
cd src && go build -o ../AdhocServer .

# Chạy Go Server
DATABASE_PATH=data/database.db ./AdhocServer

# Chạy Dashboard (Dev)
cd webapp && npm run dev
```

### 3. Cài Đặt 1 Lệnh (Production Linux VPS)
```bash
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
```
Quản lý qua CLI `ppsspp`:
- `ppsspp status`
- `ppsspp restart`
- `ppsspp logs`
- `ppsspp update`

---

## Giao Thức PRO ONLINE (TCP 27312)

| Opcode | Hướng | Bytes | Mục đích |
|---|---|---|---|
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

---

## Cấu Trúc Mã Nguồn (File Map)

### Core Server (`src/`)
- `src/main.go`: TCP accept loop, goroutine listener, timeout worker, UDP admin handler.
- `src/handlers.go`: Logic dispatch và xử lý toàn bộ opcode (Login, Connect, Disconnect, Scan, Chat).
- `src/protocol/packets.go`: Định nghĩa struct nhị phân, giải mã / đóng gói Little-Endian chính xác từng byte theo chuẩn PSP.
- `src/state/state.go`: Quản lý trạng thái người chơi, phòng chơi, game bằng map và `sync.RWMutex`.
- `src/db/db.go`: Tương tác SQLite3 (WAL mode), RAM cache cho 4,300+ game name và crosslinks, log lịch sử người chơi và tin nhắn.
- `src/api.go`: Cung cấp JSON HTTP API tại cổng `8080` (`/api/status`).
- `src/cli.sh`: Script CLI quản lý systemd.

### Dashboard (`webapp/`)
- `webapp/src/app/page.tsx` & `DashboardClient.tsx`: Dashboard chính hiển thị số người online, danh sách phòng, chatbox realtime.
- `webapp/src/app/admin/analytics/`: Thống kê xu hướng chơi game (Game Trends).
- `webapp/src/app/admin/bans/`: Giao diện quản lý Ban/Kick IP & MAC.
- `webapp/src/app/admin/monitoring/`: Theo dõi tài nguyên server.
- `webapp/prisma/schema.prisma`: Schema cơ sở dữ liệu SQLite đồng bộ giữa server và webapp.

---

## Test Suite

```bash
# Chạy toàn bộ integration tests qua Python
python3 tests/python/test_server.py -v

# Chạy test từng tính năng
python3 tests/python/test_connection.py -v
python3 tests/python/test_admin_security.py -v
python3 tests/python/test_crosslinks.py -v
python3 tests/python/test_chat_logging.py -v
```
