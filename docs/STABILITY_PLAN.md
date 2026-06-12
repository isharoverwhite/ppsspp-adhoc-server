# Kế Hoạch Nâng Cấp Độ Ổn Định — 100 Users

## Bối Cảnh

Mục tiêu: public server cho **~100 users** chạy trên CPU yếu (VD: Intel N3150).

Vấn đề không phải N3150 không đủ mạnh, mà source hiện tại có vài điểm **có thể làm server tốn CPU vô ích hoặc chết process khi gặp client lỗi mạng**.

## Phân Tích Gốc Rễ

### Vấn đề #1: Loop quét socket mỗi 1ms đốt CPU vô ích

Code hiện tại:

```c
while(server_running) {
    accept(...)
    for each user:
        recv(user_socket, ...)
    usleep(1000);
}
```

**Tính toán với 100 users:**

```
100 users × 1000 vòng/giây = 100,000 recv() calls/giây
```

Hầu hết các lần gọi `recv()` chỉ trả về `EAGAIN` — nghĩa là **không có dữ liệu**. Không có dữ liệu nhưng kernel vẫn bị gọi, context switch vẫn xảy ra, CPU vẫn quay. N3150 chịu được, nhưng đây là CPU bị đốt vô ích.

**Giải pháp:** Dùng `poll()` — kernel sẽ báo socket nào **thật sự** có dữ liệu. Server không cần tự quét từng socket liên tục nữa. CPU gần như 0% khi idle.

---

### Vấn đề #2: SIGPIPE có thể giết chết process

Khi server gọi `send()` tới client đã mất kết nối đột ngột, Linux gửi signal `SIGPIPE`. Nếu không `SIG_IGN`, **process bị kill ngay lập tức**.

**Tình huống thực tế với 100 users public:**

- Người chơi tắt PPSSPP đột ngột (không disconnect sạch)
- Mạng Wi-Fi rớt giữa chừng
- NAT timeout — router hủy mapping
- Client crash (PPSSPP crash, điện thoại hết pin)
- Mobile sleep — 3G/4G chuyển vùng

Với 100 users, những chuyện này **xảy ra thường xuyên**. Mỗi lần là 1 cơ hội server bị SIGPIPE kill.

**Giải pháp:** `signal(SIGPIPE, SIG_IGN)` ngay đầu `main()`. Kết hợp `MSG_NOSIGNAL` trong mọi lần `send()`.

---

### Vấn đề #3: `send()` không kiểm tra kết quả — lobby bị lệch trạng thái

Code hiện tại:

```c
send(peer->stream, &packet, sizeof(packet), 0);
//     ^^^^ không kiểm tra return value
```

`send()` có thể:
- Gửi thành công → return số byte đã gửi
- Gửi thiếu byte → return < sizeof(packet) — **đây là bug tiềm ẩn**
- Fail vì client disconnect → return -1, errno = EPIPE/ECONNRESET
- Fail vì socket tạm thời chưa gửi được → return -1, errno = EAGAIN (socket nonblocking)

Nếu bỏ qua lỗi, server **tưởng đã gửi** packet join/leave/scan nhưng client thật ra không nhận được. Hậu quả: danh sách peer trong group của mỗi client bị lệch. Client A thấy thiếu người, client B thấy thừa người.

**Giải pháp:** `send_all()` loop đến khi gửi hết, check lỗi từng peer, bỏ qua peer lỗi thay vì logout.

---

### Vấn đề #4: Partial send làm packet bị cắt

TCP **không đảm bảo** một lần `send()` sẽ gửi đủ toàn bộ packet, nhất là với socket nonblocking.

**Ví dụ cụ thể:**

```
send() muốn gửi 139 byte (SceNetAdhocctlConnectPacketS2C)
Nhưng TCP buffer còn trống 60 byte
→ send() trả về 60 (gửi được 60 byte, 79 byte còn lại bị nuốt)
→ Client nhận được packet bị cắt: 1 byte opcode + 59 byte đầu của nickname
→ Client không parse được, protocol lỗi
```

Với packet nhỏ (1 byte PING) thường không sao. Nhưng packet connect dài 139 byte, chat dài 193 byte — partial send hoàn toàn có thể xảy ra khi mạng chậm hoặc client nhận chậm.

**Giải pháp:** `send_all()` loop retry. Kết hợp TX buffer (P0.2) để xử lý trường hợp `EAGAIN`.

---

### Vấn đề #5: `poll()` tốt hơn vòng quét không chỉ vì hiệu năng

Dùng `poll()` không làm logic server phức tạp hơn nhiều, nhưng giúp:

| Lợi ích | Giải thích |
|----------|-----------|
| Giảm CPU idle | Kernel ngủ đến khi có event, không busy-wait |
| Giảm jitter | Response ngay khi có dữ liệu, không phải đợi hết 1ms sleep |
| Xử lý nhiều users ổn định | O(active_sockets) thay vì O(total_users) |
| Phân biệt được readable/writable/error | `POLLIN` để recv, `POLLOUT` để flush TX buffer, `POLLERR`/`POLLHUP` để detect disconnect sớm |
| Tránh busy-scan kiểu hiện tại | Không gọi `recv()` trên socket không có dữ liệu |

---

## Kết Luận: Cái Nào Cần Sửa Trước?

- **Chạy LAN/private vài người** → chưa cần sửa gấp (server ít bị stress, client disconnect hiếm)
- **Chạy public 100 users lâu dài** → phải sửa vì các lỗi này liên quan đến **độ ổn định process**, không chỉ hiệu năng

Thứ tự bắt buộc:
1. **SIGPIPE + kiểm tra send()** — đây là lỗi **có thể kill server**
2. **poll()** — bước nâng cấp kế tiếp để CPU không bị đốt vô ích

---

## Kế Hoạch Chi Tiết

### P0 — Bắt Buộc: Ngăn server chết + Gửi packet tin cậy

#### P0.1: Chặn SIGPIPE + `send_all()` wrapper

**Sửa file:** `src/main.c`, `src/user.c`

```c
// src/main.c — thêm vào đầu main(), sau các signal khác:
signal(SIGPIPE, SIG_IGN);

// src/user.c — thêm hàm mới, dùng thay cho mọi send():
static int send_all(int fd, const void *buf, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(fd, (const char*)buf + sent, len - sent,
                         MSG_NOSIGNAL);
        if (n < 0) {
            if (errno == EINTR) continue;   // Bị signal ngắt → thử lại
            return -1;                       // Lỗi thực sự
        }
        if (n == 0) return -1;              // Socket đã đóng
        sent += n;
    }
    return 0;
}

// Thay tất cả send(peer->stream, &packet, sizeof(packet), 0);
//        bằng send_all(peer->stream, &packet, sizeof(packet));
// Khi send_all() return -1: bỏ qua peer đó, tiếp tục peer khác.
// KHÔNG gọi logout_user() chỉ vì 1 peer lỗi.
```

**Impact:** Server không chết khi client RST/Wi-Fi rớt/NAT timeout. Packet luôn được gửi hết. Một peer lỗi không ảnh hưởng các peer khác.

---

#### P0.2: Per-user TX buffer + flush EAGAIN

**Sửa file:** `src/user.h` (thêm field), `src/user.c` (hàm queue), `src/main.c` (flush)

```c
// src/user.h — thêm vào SceNetAdhocctlUserNode:
uint8_t tx[4096];         // Send buffer
uint32_t tx_head;         // Vị trí bắt đầu dữ liệu chưa gửi
uint32_t tx_len;          // Số byte đang chờ gửi

// src/user.c — hàm queue_send mới:
int queue_send(SceNetAdhocctlUserNode *user, const void *data, size_t len) {
    // Nếu không có gì đang chờ: thử gửi thẳng
    if (user->tx_len == 0) {
        ssize_t n = send(user->stream, data, len, MSG_NOSIGNAL);
        if (n == (ssize_t)len) return 0;          // Gửi hết → xong
        if (n > 0) {
            // Gửi được 1 phần → queue phần còn lại
            memcpy(user->tx, (const char*)data + n, len - n);
            user->tx_head = 0;
            user->tx_len = len - n;
            return 0;
        }
        if (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
            return -1;  // Lỗi thực sự
        }
    }

    // Append vào queue nếu còn chỗ
    if (user->tx_len + len > sizeof(user->tx)) return -2;  // Queue đầy
    memcpy(user->tx + user->tx_head + user->tx_len, data, len);
    user->tx_len += len;
    return 0;
}

// src/main.c — thêm flush TX vào server_loop (trước recv):
if (user->tx_len > 0) {
    ssize_t n = send(user->stream, user->tx + user->tx_head,
                     user->tx_len, MSG_NOSIGNAL);
    if (n > 0) {
        user->tx_head += n;
        user->tx_len -= n;
        if (user->tx_len == 0) user->tx_head = 0;
    } else if (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
        logout_user(user);  // Lỗi thực sự
        continue;
    }
}
```

**Impact:** Gửi packet tin cậy 100% ngay cả khi TCP buffer đầy. Không mất notify join/leave/scan. Packet không bao giờ bị cắt.

---

### P1 — Nên Làm: Scale mượt + Production-ready

#### P1.3: `poll()` thay vòng quét `usleep(1000)`

**Sửa file:** `src/main.c` — viết lại `server_loop`

```c
#include <poll.h>

int server_loop(int server) {
    _status = 1;
    update_status();

    struct pollfd fds[SERVER_USER_MAXIMUM + 1];
    SceNetAdhocctlUserNode *fd_to_user[SERVER_USER_MAXIMUM + 1];

    while (_status == 1) {
        int nfds = 0;

        // Server socket (accept)
        fds[nfds].fd = server;
        fds[nfds].events = POLLIN;
        fds[nfds].revents = 0;
        fd_to_user[nfds] = NULL;
        nfds++;

        // User sockets
        SceNetAdhocctlUserNode *user = _db_user;
        while (user != NULL) {
            fds[nfds].fd = user->stream;
            fds[nfds].events = POLLIN;
            if (user->tx_len > 0) fds[nfds].events |= POLLOUT;
            fds[nfds].revents = 0;
            fd_to_user[nfds] = user;
            nfds++;
            user = user->next;
        }

        int ret = poll(fds, nfds, 1000);  // Timeout 1 giây
        if (ret < 0) {
            if (errno == EINTR) continue;
            break;
        }

        // Xử lý server socket: accept
        if (fds[0].revents & POLLIN) {
            // Accept loop (giữ nguyên logic cũ)
        }

        // Xử lý user sockets
        for (int i = 1; i < nfds; i++) {
            user = fd_to_user[i];
            if (user == NULL) continue;

            // Flush TX nếu POLLOUT
            if (fds[i].revents & POLLOUT) {
                // flush tx buffer
            }

            // Recv nếu POLLIN
            if (fds[i].revents & POLLIN) {
                // recv + process (giữ nguyên logic cũ)
            }

            // Error: POLLERR hoặc POLLHUP
            if (fds[i].revents & (POLLERR | POLLHUP)) {
                logout_user(user);
            }
        }
    }

    free_database();
    close(server);
    return 0;
}
```

**Impact:** CPU gần 0% khi idle (thay vì 100,000 recv/s). Response latency thấp hơn (không phải đợi hết 1ms sleep). Phân biệt được socket lỗi qua `POLLERR`/`POLLHUP`.

---

#### P1.4: Sửa include cho portable build

**Sửa file:** `src/main.c`, `src/user.c`

```c
// src/main.c — thêm:
#include <unistd.h>      // close(), usleep(), fcntl()

// src/user.c — thêm:
#include <unistd.h>      // close()
```

**Lý do:** macOS cần `<unistd.h>` cho `close()`, `usleep()`, `fcntl()`. Linux thường implicit qua `<sys/socket.h>` nhưng không portable. Build bằng Docker không bị, nhưng dev trên macOS cần.

---

#### P1.5: Config qua biến môi trường

**Sửa file:** Thêm `src/config.c`, sửa `src/config.h`

```c
// src/config.h — chuyển từ #define sang extern:
extern uint16_t g_server_port;
extern int      g_user_max;
extern int      g_user_timeout;
extern char     g_database_path[256];
extern char     g_status_path[256];

// src/config.c — file mới:
#include <stdlib.h>
#include <string.h>
#include "config.h"

uint16_t g_server_port = 27312;
int      g_user_max = 1024;
int      g_user_timeout = 15;
char     g_database_path[256] = "database.db";
char     g_status_path[256] = "www/status.xml";

void load_config(void) {
    char *e;
    if ((e = getenv("ADHOC_PORT")))         g_server_port = atoi(e);
    if ((e = getenv("ADHOC_MAX_USERS")))    g_user_max = atoi(e);
    if ((e = getenv("ADHOC_TIMEOUT")))      g_user_timeout = atoi(e);
    if ((e = getenv("ADHOC_DB_PATH")))      strncpy(g_database_path, e, 255);
    if ((e = getenv("ADHOC_STATUS_PATH")))  strncpy(g_status_path, e, 255);
}
```

```bash
# Triển khai linh hoạt không cần recompile:
ADHOC_PORT=12345 ADHOC_MAX_USERS=100 ADHOC_TIMEOUT=30 ./AdhocServer
```

---

#### P1.6: Validate database lúc start

**Sửa file:** `src/user.c` — thêm hàm, gọi từ `main()`

```c
int validate_database(void) {
    sqlite3 *db = NULL;
    if (sqlite3_open(g_database_path, &db) != SQLITE_OK) {
        fprintf(stderr, "WARNING: Cannot open '%s': %s\n",
                g_database_path, sqlite3_errmsg(db));
        fprintf(stderr, "Cross-region linking disabled.\n");
        return 0;  // Không fatal
    }

    // Đảm bảo bảng tồn tại
    sqlite3_exec(db,
        "CREATE TABLE IF NOT EXISTS productids(id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        NULL, NULL, NULL);
    sqlite3_exec(db,
        "CREATE TABLE IF NOT EXISTS crosslinks(id_from TEXT, id_to TEXT)",
        NULL, NULL, NULL);

    // Đếm game đã biết
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM productids", -1, &stmt, NULL);
    int count = 0;
    if (sqlite3_step(stmt) == SQLITE_ROW) count = sqlite3_column_int(stmt, 0);
    sqlite3_finalize(stmt);

    printf("Database OK: %d games, crosslinks loaded.\n", count);
    sqlite3_close(db);
    return 1;
}
```

---

### P2 — Nên Làm Sau: Tối ưu & An toàn

#### P2.7: Debounce status.xml

```c
// Thay mọi update_status() trong user.c bằng update_status_throttled():
static time_t last_status = 0;
static int status_dirty = 0;

void update_status_throttled(void) {
    time_t now = time(NULL);
    if (now - last_status >= 1) {
        update_status();
        last_status = now;
        status_dirty = 0;
    } else {
        status_dirty = 1;
    }
}
// Trong main loop, cuối mỗi vòng poll:
if (status_dirty && time(NULL) - last_status >= 1) {
    update_status();
    last_status = time(NULL);
    status_dirty = 0;
}
```

**Impact:** Với 100 users login/logout đồng loạt, thay vì 100 lần ghi file + mở DB, chỉ ghi tối đa 1 lần/giây.

---

#### P2.8: Signal handler an toàn

```c
// src/main.c — sửa từ int _status = 0 thành:
volatile sig_atomic_t _status = 0;

// Signal handler chỉ set flag:
void interrupt(int sig) {
    _status = 0;
}
// Tất cả printf đã có sẵn trước/sau server_loop, không cần trong handler.
```

---

#### P2.9: Pipe handle EPIPE/ENXIO (nếu tích hợp Delph)

```c
// src/pipe.c — sửa write_pipe:
int write_pipe(const char *msg) {
    if (pd < 0) {
        if (create_pipe() < 0) return -1;
    }
    int len = strlen(msg) + 1;
    int sent = write(pd, msg, len);
    if (sent < 0) {
        if (errno == EPIPE || errno == ENXIO) {
            close_pipe();     // Reader biến mất → đóng pipe
            return 0;         // Không fatal, lần sau tự reconnect
        }
        return -1;
    }
    return sent;
}
```

---

## Tổng Kết

| TT | Mục | Thời gian | Tại sao cần |
|----|-----|-----------|-------------|
| **P0.1** | SIGPIPE + `send_all()` | 1h | **Server chết** khi client RST/Wi-Fi rớt |
| **P0.2** | TX buffer + flush EAGAIN | 3h | **Packet bị cắt** (139B thành 60B), lobby lệch |
| **P1.3** | `poll()` thay 1ms loop | 4h | **100,000 recv/s vô ích** → CPU 0% idle |
| **P1.4** | Fix include portable | 0.5h | Build được trên macOS dev |
| **P1.5** | Config env | 2h | Deploy không cần recompile |
| **P1.6** | Validate DB | 1h | Cảnh báo sớm, auto-tạo bảng |
| **P2.7** | Debounce status.xml | 1h | 100 lần ghi/giây → 1 lần/giây |
| **P2.8** | Signal handler an toàn | 0.25h | Async-signal-safe |
| **P2.9** | Pipe EPIPE handle | 1h | Pipe không kill server |

- **P0:** Bắt buộc cho public server — liên quan đến **độ ổn định process**, không chỉ hiệu năng
- **P1:** Để N3150 chạy mượt 100 users dài hạn
- **P2:** Tối ưu thêm, không gấp

**Tổng P0+P1:** ~12 giờ → server sẵn sàng public 100 users.
**Toàn bộ:** ~14 giờ.
