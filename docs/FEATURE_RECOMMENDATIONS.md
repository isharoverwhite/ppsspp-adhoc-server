# Đánh Giá & Đề Xuất Tính Năng

## Tính Năng Hiện Có

| # | Tính năng | Trạng thái | File |
|---|-----------|-----------|------|
| 1 | TCP lobby server | ✅ Hoàn chỉnh | main.c |
| 2 | Xác thực user (MAC + nickname + game) | ✅ Hoàn chỉnh | user.c |
| 3 | Phân nhóm theo game | ✅ Hoàn chỉnh | user.c |
| 4 | Join/Leave group + notify peer | ✅ Hoàn chỉnh | user.c |
| 5 | Scan group (liệt kê phòng) | ✅ Hoàn chỉnh | user.c |
| 6 | Gán BSSID (MAC host) | ✅ Hoàn chỉnh | user.c |
| 7 | Chat trong group (64 byte) | ✅ Hoàn chỉnh | user.c |
| 8 | Keep-alive ping + timeout 15s | ✅ Hoàn chỉnh | user.c |
| 9 | Cross-region game linking (SQLite) | ✅ Hoàn chỉnh | user.c |
| 10 | Auto-register game ID mới | ✅ Hoàn chỉnh | user.c |
| 11 | XML status cho web monitoring | ✅ Hoàn chỉnh | status.c |
| 12 | Graceful shutdown + chat notice | ✅ Hoàn chỉnh | user.c |
| 13 | IP dedup (1 kết nối/IP) | ⚠️ Hạn chế | user.c |
| 14 | Docker multi-arch (amd64 + arm64) | ✅ Hoàn chỉnh | Dockerfile |
| 15 | GitHub CI/CD (Docker build on push) | ✅ Hoàn chỉnh | ci.yml |

---

## So Sánh: Fork Này vs. Delph Gốc

| Khía cạnh | Fork này (souler) | Delph Original |
|-----------|-------------------|----------------|
| Tổ chức source | `src/` subdirectory | Flat root |
| Console output | Unbuffered (`setbuf(stdout, NULL)`) | Buffered |
| Named pipe | ❌ **Thiếu** | ✅ pipe.c / pipe.h |
| Lifecycle events | ❌ **Thiếu** | ✅ PIPE_START / PIPE_STOP |
| Join/Leave events | printf only | printf + write_pipe |
| Makefile | `SRC_DIR = ./src/` | Không subdirectory |
| Docker | Multi-stage Alpine 3.12 | Không có |
| CI/CD | GitHub Actions buildx | Không có |
| database.db | Pre-populated 20+ games | Không rõ |

---

## Tính Năng Đề Xuất

### 🔴 P0 — Bắt Buộc (sẽ làm chết server hoặc sai lobby)

| # | Tính năng | Effort | Impact |
|---|----------|--------|--------|
| 1 | `signal(SIGPIPE, SIG_IGN)` + `send_all()` + `MSG_NOSIGNAL` | 1h | Server không chết khi client RST |
| 2 | Per-user TX buffer + flush queue + retry EAGAIN | 3h | Gửi packet notify tin cậy 100% |

### 🟠 P1 — Nên làm để scale mượt 100 users

| # | Tính năng | Effort | Impact |
|---|----------|--------|--------|
| 3 | `poll()` thay vòng quét `usleep(1000)` | 4h | CPU ~0% idle, latency thấp |
| 4 | Fix include `<unistd.h>`, `<sys/socket.h>` | 0.5h | Build được trên macOS dev |
| 5 | Config qua env (`ADHOC_PORT`, `ADHOC_MAX_USERS`, `ADHOC_TIMEOUT`) | 2h | Deploy không recompile |
| 6 | Validate database.db lúc start | 1h | Cảnh báo sớm, auto-tạo bảng |

### 🟢 P2 — Nên làm sau (tối ưu & an toàn)

| # | Tính năng | Effort | Impact |
|---|----------|--------|--------|
| 7 | Debounce status.xml (max 1 lần/giây) | 1h | Giảm disk I/O |
| 8 | Sửa signal handler (bỏ printf) | 0.25h | Async-signal-safe |
| 9 | Sửa FIFO pipe error handling (EPIPE/ENXIO) | 1h | Pipe không crash server |

### 🔵 Có thể làm sau này (không gấp)

| # | Tính năng | Effort | Impact |
|---|----------|--------|--------|
| 10 | REST API companion (đọc pipe + status.xml) | 8h | Dashboard, bot Discord |
| 11 | Hệ thống ban (MAC-based, SQLite) | 3h | Chống phá hoại |
| 12 | Game-specific chat channels | 2h | Chat xuyên group cùng game |
| 13 | Prometheus metrics endpoint | 6h | Monitoring chuẩn |
| 14 | WebSocket status stream | 12h | Realtime web dashboard |
| 15 | TLS (OpenSSL) | 8h | Bảo mật (nếu cần) |

---

## Những Thứ Không Cần Làm Cho 100 Users

- ❌ **Multi-thread** — Single-thread + poll() đủ cho 100-500 users
- ❌ **Database server riêng** — SQLite đủ cho read-heavy workload này
- ❌ **Rewrite sang Go/Rust/Python** — Code C hiện tại rất gọn (~1100 dòng), sửa trực tiếp nhanh hơn
- ❌ **Tối ưu RAM** — Mỗi user tốn ~1.5KB (struct + buffer), 100 users = 150KB
- ❌ **Thay đổi giao thức** — PPSSPP client đã hardcode protocol này

---

## Lộ Trình Triển Khai

```
Tuần 1: P0.1 + P0.2 (server không chết, packet không mất)
         ↓
Tuần 2: P1.3 + P1.4 + P1.5 + P1.6 (poll loop, config env, validate DB)
         ↓
Tuần 3: P2.7 + P2.8 + P2.9 (debounce status, signal handler, pipe error)
         ↓
Tuần 4: Named Pipe integration (Delph join/leave events)
         ↓
Tương lai: REST API + Ban system + Prometheus
```

**Tổng P0+P1:** ~12 giờ → server ổn định cho 100 users production.
**Toàn bộ P0-P2:** ~14 giờ → đầy đủ tính năng, an toàn, dễ maintain.
