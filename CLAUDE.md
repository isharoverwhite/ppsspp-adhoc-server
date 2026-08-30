# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Kiến Trúc Dự Án (Go Native + Next.js Dashboard)

Hệ thống bao gồm 2 thành phần chính:
1. **Core Ad-Hoc Server (`src/`)**: Viết bằng **Golang** đa luồng (Goroutines), xử lý giao thức PRO ONLINE (nhị phân, opcode-based trên cổng TCP `27312`).
2. **Admin & Analytics Dashboard (`webapp/`)**: Viết bằng **Next.js 16 (React, Tailwind CSS, Prisma, SQLite)**, quản lý máy chủ qua web trên cổng HTTP `3000`.

---

## Build & Run

### 1. Dùng Docker Compose (Khuyên dùng)
```bash
docker-compose up -d --build
```

### 2. Build & Chạy Natively (Local Dev)
```bash
# Build Go Server
make server

# Chạy Go Server
DATABASE_PATH=data/database.db ./AdhocServer

# Chạy Dashboard (Dev)
cd webapp && npm run dev
```

### 3. Cài Đặt 1 Lệnh (Production Linux VPS)
```bash
curl -fsSL https://raw.githubusercontent.com/isharoverwhite/ppsspp-adhoc-server/master/install.sh | sudo bash
```

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
