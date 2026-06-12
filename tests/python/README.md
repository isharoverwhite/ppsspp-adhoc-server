# Python Integration Tests — PPSSPP Ad-Hoc Server

Test server bằng cách kết nối TCP client thật và gửi/nhận tất cả opcode của giao thức PRO ONLINE.

## Chạy Nhanh

```bash
# Build + chạy server + test + dọn dẹp (tự động, dùng Docker):
./tests/python/run_tests.sh

# Hoặc thủ công:
# Terminal 1: Build & chạy server bằng Docker
docker build -t ppsspp-adhoc .
docker run --rm -p 27312:27312 -it ppsspp-adhoc

# Terminal 2: Chạy test
python3 tests/python/test_server.py -v
```

## Yêu Cầu

- **Docker** (để build server — code C không build được trên macOS)
- **Python 3.7+** (không cần pip install, chỉ dùng stdlib)
- **nc** (netcat) — cho `run_tests.sh` kiểm tra server sẵn sàng

## Nội Dung Test

| Class | Kiểm tra |
|-------|----------|
| `TestServerConnection` | TCP connect/disconnect, login với product code hợp lệ/không hợp lệ, nhiều kết nối |
| `TestGroupOperations` | Join/leave group, scan, tên group không hợp lệ, state machine |
| `TestChat` | Gửi chat, chat khi chưa vào group bị kick, tin nhắn dài |
| `TestPingTimeout` | Ping giữ kết nối sống, idle timeout sau 15s |
| `TestProtocolEdgeCases` | Opcode không hợp lệ, packet bị cắt, product code validation |
| `TestMultiClientGroup` | Kiểm tra IP dedup, multi-client behavior |

## Cấu Hình

```bash
# Đổi host/port:
ADHOC_HOST=192.168.1.100 ADHOC_PORT=12345 python3 test_server.py -v

# Chạy 1 test cụ thể:
python3 test_server.py TestGroupOperations.test_join_group -v

# Với pytest (nếu có):
pip install pytest
pytest test_server.py -v -k "test_login"
```

## File

- `protocol.py` — Thư viện giao thức: build/parse packet, class `AdhocClient`
- `test_server.py` — Test suite (unittest)
- `run_tests.sh` — Script tự động build Docker + start server + test + cleanup
- `requirements.txt` — Không có dependency ngoài
- `README.md` — File này

## Ghi Chú

- Server có IP dedup → chỉ 1 client per IP kết nối được. Test multi-client trên localhost sẽ thấy client thứ 2 bị từ chối.
- Test timeout (`test_no_ping_causes_timeout`) mất ~20 giây để chạy.
- Nếu server không chạy, tất cả test sẽ bị skip.
