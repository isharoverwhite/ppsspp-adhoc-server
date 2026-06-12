# Kế Hoạch Chuyển Đổi Sang Go

> ⚠️ **Đây là kế hoạch tương lai. Sẽ thực hiện SAU KHI code C đã chạy Production ổn định.**

---

## Nguyên Tắc Quan Trọng Nhất

**Không được fix cứng danh sách tính năng trong file này.** Code C sẽ liên tục thay đổi (sửa bug P0-P2, thêm pipe, thêm config, thêm tính năng mới...). Khi đến lúc migrate, agent phải:

1. **Quét lại toàn bộ code C hiện tại** — đọc từng file `.c` và `.h`, phát hiện mọi chức năng đang có
2. **Tạo plan migrate mới** dựa trên code C thực tế tại thời điểm đó
3. **Code Go luôn tham chiếu code C gốc** — mỗi hàm Go phải map về 1 hàm C cụ thể
4. **Không bỏ sót** — mọi opcode, mọi packet struct, mọi state machine, mọi SQL query, mọi side effect (console log, status.xml, pipe event) đều phải có trong Go

---

## Quy Trình Migrate (Dành Cho Agent)

### Phase 0: Quét & Phân Tích Code C

Trước khi viết bất kỳ dòng Go nào, agent phải:

```
Bước 1: Đọc toàn bộ file .c và .h trong src/
        ├── src/main.c      → tìm: tất cả opcode handler, signal handler, event loop
        ├── src/user.c      → tìm: tất cả hàm xử lý user/game/group, DB query
        ├── src/user.h      → tìm: tất cả struct, extern var, function signature
        ├── src/status.c    → tìm: logic ghi status.xml, SQL query lấy tên game
        ├── src/status.h    → tìm: function signature
        ├── src/packets.h   → tìm: tất cả opcode constant, tất cả packet struct + kích thước
        ├── src/pspstructs.h→ tìm: tất cả PSP type (MAC, GroupName, Nickname)
        ├── src/config.h    → tìm: tất cả hằng số, #define
        ├── src/pipe.h      → tìm: function signature (nếu đã tích hợp Delph)
        ├── src/pipe.c      → tìm: logic FIFO pipe (nếu có)
        └── src/config.c    → tìm: logic load env config (nếu đã thêm P1.5)

Bước 2: Lập danh sách TẤT CẢ tính năng từ code C hiện tại
        Mỗi tính năng = { tên, file C, hàm/struct C, mô tả, trạng thái }

Bước 3: Phát hiện TẤT CẢ hằng số và magic number
        Port, timeout, max users, kích thước packet, opcode value...

Bước 4: Vẽ state machine của user từ code C
        User đi từ state nào → state nào, điều kiện gì

Bước 5: Liệt kê tất cả SQL query trong code C
        SELECT/INSERT gì, bảng nào, cột nào

Bước 6: Liệt kê tất cả side effect
        Console log, status.xml, pipe event, update_status()...
```

**Kết quả Phase 0:** Một file `MIGRATION_SNAPSHOT.md` (tự động sinh, không commit cứng) chứa toàn bộ danh sách tính năng phát hiện được từ code C tại thời điểm migrate.

### Phase 1: Thiết Kế Kiến Trúc Go

Dựa trên snapshot từ Phase 0, thiết kế cấu trúc file Go:

```
ppsspp-adhoc-go/
├── main.go          # Entry point, signal handler, config
├── server.go        # TCP accept, goroutine per client, read/write loop
├── protocol.go      # Tất cả packet struct + Marshal/Unmarshal
├── lobby.go         # User/Game/Group management (thay linked list = map+slice)
├── status.go        # XML/JSON status output
├── db.go            # SQLite queries
├── pipe.go          # Join/leave events (nếu C có pipe)
└── *_test.go        # Test cho từng file
```

Nguyên tắc thiết kế:
- **Mỗi file .c trong C → một file .go tương ứng** (dễ tham chiếu)
- **Mỗi hàm C → một method Go**, giữ tên tương tự để dễ map
- **`SceNetAdhocctlUserNode` (linked list) → `map[uint32]*User` + `sync.RWMutex`**
- **`SceNetAdhocctlGameNode` → `map[string]*Game`**
- **`SceNetAdhocctlGroupNode` → `[]*Group` trong Game struct**

### Phase 2: Code Go — Luôn Tham Chiếu Code C

Khi viết từng hàm Go, agent phải:

```
Với mỗi hàm Go:
1. Ghi comment // C: src/file.c:Line — map đến hàm C tương ứng
2. Copy nguyên logic từ C sang Go (giữ nguyên flow, chỉ đổi syntax)
3. Kiểm tra: có bỏ sót side effect nào không?
   - printf(...)     → log.Printf(...)
   - update_status() → Status.ThrottledWrite()
   - write_pipe(...) → Pipe.Write(...)
4. Viết test Go verify output giống hệt C
```

Ví dụ cách comment tham chiếu:

```go
// JoinGroup xử lý user join vào game group.
// C: src/user.c:290 connect_user()
//   - Validate group name (C: line 293-313)
//   - Tìm group trong game (C: line 322-323)
//   - Tạo group mới nếu chưa có (C: line 335-359)
//   - Notify peer OPCODE_CONNECT S2C (C: line 366-401)
//   - Gán BSSID = MAC host (C: line 403, 421)
//   - Log join event (C: line 424-431)
//   - Ghi pipe JOIN event (C: line 433-434) — nếu có pipe
//   - Gọi update_status() (C: line 436)
func (l *Lobby) JoinGroup(user *User, groupName string) error {
    // ...
}
```

### Phase 3: Test So Sánh C vs Go

Trước khi switch traffic, phải verify:

1. **Protocol compatibility:** Cùng 1 input → C và Go tạo ra output bytes giống hệt
2. **Behavior:** Cùng 1 kịch bản → C và Go có cùng state (user list, group list)
3. **Edge cases:** Cùng 1 input lỗi → C và Go xử lý giống nhau (kick/log/ignore)

```go
// Ví dụ test so sánh:
func TestLoginPacket_MatchesC(t *testing.T) {
    // Build packet bằng Go
    goPkt := BuildLoginPacket(mac, name, game)

    // Đọc reference từ C test (đã capture trước đó)
    cPkt := loadCReference("testdata/login_packet_c.bin")

    if !bytes.Equal(goPkt, cPkt) {
        t.Errorf("Go packet != C packet at offset %d", findDiff(goPkt, cPkt))
    }
}
```

### Phase 4: Deploy — Switch Dần

```
Bước 1: Deploy Go server trên port khác (27313)
Bước 2: Trỏ 10% client sang Go, monitor
Bước 3: So sánh log C vs Go, tìm khác biệt
Bước 4: Tăng dần → 50% → 100%
Bước 5: Tắt C server
```

---

## Quy Tắc Bắt Buộc Khi Viết Go

### 1. Giữ nguyên byte order

Code C dùng native-endian (little-endian trên x86/ARM). Go phải dùng `binary.LittleEndian`.

```go
// ❌ Sai: dùng BigEndian
binary.BigEndian.PutUint32(buf, ip)

// ✅ Đúng: dùng LittleEndian như native C
binary.LittleEndian.PutUint32(buf, ip)
```

### 2. Giữ nguyên kích thước packet

Mỗi packet struct trong Go phải có đúng kích thước như `sizeof()` trong C. Dùng test verify:

```go
func TestPacketSizes(t *testing.T) {
    tests := []struct{
        name string
        val  interface{}
        size int
    }{
        {"LoginPacketC2S", LoginPacketC2S{}, 144},
        {"ConnectPacketC2S", ConnectPacketC2S{}, 9},
        {"ConnectPacketS2C", ConnectPacketS2C{}, 139},
        // ... tất cả packet structs
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            buf := new(bytes.Buffer)
            binary.Write(buf, binary.LittleEndian, tt.val)
            if buf.Len() != tt.size {
                t.Errorf("%s: got %d bytes, expected %d", tt.name, buf.Len(), tt.size)
            }
        })
    }
}
```

### 3. Giữ nguyên logic xử lý lỗi

Code C logout user khi gặp lỗi trong nhiều trường hợp. Go phải giữ nguyên behavior đó:

```go
// C: src/main.c:282-288 — invalid opcode trong WAITING → logout_user()
// C: src/main.c:365-373 — invalid opcode trong LOGGED_IN → logout_user()
// C: src/user.c:474  — invalid group name → logout_user()
// C: src/user.c:574  — disconnect khi không trong group → logout_user()
// ...
```

### 4. Map toàn bộ side effect

| Side effect trong C | Tương đương Go |
|---------------------|----------------|
| `printf(...)` | `log.Printf(...)` hoặc `slog.Info(...)` |
| `update_status()` | `status.ThrottledWrite()` |
| `write_pipe(msg)` | `pipe.Write(msg)` |
| `sqlite3_open/close` | `db.Query/Close` |

---

## Những Thứ Go Có Sẵn — Không Cần Viết Lại

Khi migrate, tận dụng Go stdlib thay vì copy cơ chế C:

| Cơ chế C | Cách làm trong Go |
|----------|-------------------|
| `usleep(1000)` busy loop | Goroutine block trên `conn.Read()` — kernel tự poll |
| `poll()` / `select()` | Go runtime tự dùng epoll/kqueue |
| `signal(SIGPIPE, SIG_IGN)` | Không cần — Go `net.Conn` không sinh SIGPIPE |
| `send_all()` loop retry | `conn.Write()` đã loop hết |
| TX buffer + flush | `bufio.Writer` hoặc goroutine sender riêng |
| `malloc`/`free` manual | GC tự động |
| Config từ env (`getenv`) | `os.Getenv()` |
| `clear_user_rxbuf()` memmove | `buf = buf[n:]` slice |
| `fcntl(F_SETFL, O_NONBLOCK)` | Mặc định — mọi `net.Conn` đều non-blocking |

---

## Khi Nào Bắt Đầu Migrate?

Điều kiện để bắt đầu:

- [ ] Code C đã sửa xong P0 (không chết server, packet không mất)
- [ ] Code C đã sửa xong P1 (poll, config env, validate DB)
- [ ] Code C đã chạy production ổn định ít nhất 1 tuần
- [ ] Đã tích hợp pipe join/leave (nếu cần)
- [ ] Đã có test suite Python chạy ổn định để verify Go

Khi bắt đầu, agent sẽ **chạy Phase 0** — quét lại toàn bộ code C và sinh `MIGRATION_SNAPSHOT.md` mới, phản ánh chính xác code C tại thời điểm đó.
