# Kế Hoạch Tích Hợp Named Pipe Join/Leave Event từ Delph/AdhocServerPro

## Tổng Quan

Repo [Delph/AdhocServerPro](https://github.com/Delph/AdhocServerPro) có thêm hệ thống **Unix named pipe (FIFO)** cho phép tiến trình bên ngoài đọc event realtime từ server. Repo hiện tại **thiếu hoàn toàn** tính năng này.

---

## Khác Biệt Chính: 4 Thứ Cần Thêm

| # | File | Nội dung |
|---|------|----------|
| 1 | `src/pipe.h` (mới) | Khai báo API: `create_pipe()`, `close_pipe()`, `write_pipe()` |
| 2 | `src/pipe.c` (mới) | Triển khai FIFO: `mkfifo()`, non-blocking write |
| 3 | `src/config.h` (sửa) | Thêm 3 define: `PIPE_NAME`, `PIPE_START`, `PIPE_STOP` |
| 4 | `src/main.c` (sửa) | Gọi `create_pipe()` lúc start, `write_pipe(START/STOP)` |
| 5 | `src/user.c` (sửa) | Gọi `write_pipe("name:JOIN:...")` và `write_pipe("name:LEAVE:...")` |
| 6 | `Makefile` (sửa) | Thêm `pipe.o` vào OBJ |

Tổng: **~80 dòng code C mới**, sửa 3 file có sẵn.

---

## Chi Tiết Từng Bước

### Bước 1: Tạo `src/pipe.h`

```c
#ifndef _PIPE_H_
#define _PIPE_H_

int create_pipe(void);
void close_pipe(void);
int write_pipe(const char *msg);

#endif
```

### Bước 2: Tạo `src/pipe.c` (đã sửa lỗi EPIPE so với bản Delph gốc)

```c
#include <pipe.h>
#include <config.h>
#include <stdio.h>
#include <string.h>     // strlen
#include <sys/types.h>  // mkfifo
#include <sys/stat.h>   // mkfifo
#include <fcntl.h>      // open, O_NONBLOCK, O_WRONLY
#include <unistd.h>     // write, close
#include <errno.h>      // errno, perror

static int pd = -1;

int create_pipe(void)
{
    if (mkfifo(PIPE_NAME, 0666) == -1) {
        if (errno != EEXIST) {
            perror("create_pipe: mkfifo");
            return -1;
        }
    }

    if (pd != -1) close_pipe();

    pd = open(PIPE_NAME, O_NONBLOCK | O_WRONLY);
    if (pd == -1) {
        if (errno != ENXIO) {   // ENXIO = chưa có reader → không fatal
            perror("create_pipe: open");
            return -1;
        }
        return -2;  // Sẽ thử lại lần sau
    }
    return pd;
}

void close_pipe(void)
{
    if (pd >= 0) {
        close(pd);
        pd = -1;
    }
}

int write_pipe(const char *msg)
{
    if (pd < 0) {
        if (create_pipe() < 0) return -1;
    }

    int len = strlen(msg) + 1;  // Gửi cả null byte
    int sent = write(pd, msg, len);

    if (sent == -1) {
        if (errno == EPIPE || errno == ENXIO) {
            // Reader biến mất hoặc chưa kết nối → đóng pipe, lần sau thử lại
            close_pipe();
            return 0;  // Không fatal
        }
        perror("write_pipe");
        return -1;
    }

    return sent;
}
```

**Điểm khác biệt so với Delph gốc:**
- Delph gốc không handle `EPIPE` → nếu reader disconnect, lần write tiếp theo gây `SIGPIPE` làm chết server
- Bản này: bắt `EPIPE` + `ENXIO`, tự đóng pipe, lần sau tự reconnect
- Nhớ thêm `signal(SIGPIPE, SIG_IGN)` trong `main()` (đã có trong P0.1 của Stability Plan)

### Bước 3: Sửa `src/config.h` — Thêm 3 Dòng

```c
// Thêm vào cuối file, trước #endif:
#define PIPE_NAME "pipe"       // Đường dẫn FIFO
#define PIPE_START "START"     // Gửi khi server boot
#define PIPE_STOP  "STOP"      // Gửi khi server shutdown
```

### Bước 4: Sửa `src/main.c`

```c
// Thêm #include:
#include <pipe.h>

// Trong main(), sau signal(SIGTERM, interrupt):
signal(SIGPIPE, SIG_IGN);  // P0.1 — Không cho kernel giết process

// Sau dòng signal, thêm:
int pipe_fd = create_pipe();
if (pipe_fd == -1) {
    fprintf(stderr, "WARNING: Cannot create event pipe. Continuing without it.\n");
    // Không return 1 — pipe là optional, server vẫn chạy được
}

// Sau printf "Listening for Connections...":
write_pipe(PIPE_START);

// Sau printf "Shutdown complete." và trước return:
write_pipe(PIPE_STOP);
close_pipe();
```

### Bước 5: Sửa `src/user.c`

```c
// Thêm #include:
#include <pipe.h>

// Trong connect_user(), sau dòng printf "joined %s group %s"
// (khoảng dòng 431 trong code hiện tại):
char buf[256];
snprintf(buf, sizeof(buf), "%s:JOIN:%s:%s",
    (char*)user->resolver.name.data, safegamestr, safegroupstr);
write_pipe(buf);

// Trong disconnect_user(), sau dòng printf "left %s group %s"
// (khoảng dòng 529 trong code hiện tại):
snprintf(buf, sizeof(buf), "%s:LEAVE:%s:%s",
    (char*)user->resolver.name.data, safegamestr, safegroupstr);
write_pipe(buf);
```

**Lưu ý:** Dùng `snprintf` (an toàn) thay vì `sprintf` (Delph gốc) vì nickname có thể dài 128 ký tự, buffer 128 byte dễ tràn.

### Bước 6: Sửa `Makefile`

```makefile
# Đổi dòng:
OBJ = main.o user.o status.o
# Thành:
OBJ = main.o user.o status.o pipe.o
```

---

## Định Dạng Giao Thức Pipe

```
TênNgườiChơi:EVENT:MãGame:TênNhóm
```

**Ví dụ thực tế:**
```
KienPlayer:JOIN:ULUS10511:ABC123
ProGamer:LEAVE:ULUS10511:ABC123
```

**Event vòng đời server:**
```
START
STOP
```

---

## Cách Dùng Pipe Từ Bên Ngoài

### Bash — Đọc event realtime
```bash
cat pipe
# Output:
# START
# KienPlayer:JOIN:ULUS10511:TESTGRP1
# ProGamer:JOIN:ULUS10511:TESTGRP1
# ProGamer:LEAVE:ULUS10511:TESTGRP1
# STOP
```

### Python — Tích hợp bot Discord
```python
import os

pipe_path = "pipe"
if not os.path.exists(pipe_path):
    os.mkfifo(pipe_path, 0o666)

with open(pipe_path, 'r') as f:
    for line in f:
        line = line.strip('\x00').strip()
        if line in ('START', 'STOP'):
            print(f"[Server] {line}")
        elif ':' in line:
            name, event, game, group = line.split(':')
            print(f"[{event}] {name} ({game}/{group})")
```

### Thay Thế Pipe Bằng JSON Log File (Khuyên Dùng)

Pipe có nhược điểm: reader disconnect thì mất event. JSON file đơn giản hơn, không mất event:

```c
// src/event.c (file mới, thay thế pipe.c)
void write_event(const char *type, const char *name,
                 const char *game, const char *group) {
    FILE *f = fopen("events.jsonl", "a");
    if (f) {
        fprintf(f, "{\"ts\":%ld,\"type\":\"%s\",\"name\":\"%s\",\"game\":\"%s\",\"group\":\"%s\"}\n",
                time(NULL), type, name, game, group);
        fclose(f);
    }
}
```

```bash
# Dùng:
tail -f events.jsonl | jq '.'
# Webhook server đọc file này mỗi giây để gửi Discord
```

---

## Tổng Kết

| Cách | Ưu điểm | Nhược điểm |
|------|---------|-----------|
| FIFO pipe (Delph) | Real-time, không polling | Mất event khi reader chưa sẵn sàng, phải handle `EPIPE` |
| JSON file | Không mất event, dễ parse, dễ debug | Cần polling hoặc `inotify` để đọc realtime |
| **Khuyến nghị** | **Làm cả hai** — pipe cho realtime, file JSON cho backup/log | |

Repo này sẽ triển khai **pipe trước** (theo đúng Delph) + thêm error handling `EPIPE`/`ENXIO` như P2.9. JSON file làm sau nếu cần.
