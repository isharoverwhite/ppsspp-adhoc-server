#!/bin/bash
# ============================================================
# PPSSPP Ad-Hoc Server — Integration Test Runner
#
# Build server bằng Docker, chạy test Python, dọn dẹp.
# Dùng được trên macOS và Linux (không cần GCC native).
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_IMAGE="ppsspp-adhoc-test"
CONTAINER_NAME="adhoc-test-server"
SERVER_PORT="${ADHOC_PORT:-27312}"

cleanup() {
    echo ""
    echo "🛑 Dừng container test..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    echo "✅ Dọn dẹp xong."
}
trap cleanup EXIT INT TERM

# ── Build Docker image ──────────────────────────────────────
echo "🔨 Build Docker image..."
echo ""
docker build -t "$DOCKER_IMAGE" "$REPO_ROOT"
echo ""

# ── Tạo thư mục cần thiết ──────────────────────────────────
mkdir -p "$REPO_ROOT/www"
mkdir -p "$REPO_ROOT/data"
touch "$REPO_ROOT/data/database.db"

# ── Chạy server trong container ─────────────────────────────
echo "🚀 Khởi động server trong Docker (port $SERVER_PORT)..."
docker run --rm -d \
    --name "$CONTAINER_NAME" \
    -p "$SERVER_PORT:27312" \
    -e DATABASE_PATH=/app/data/database.db \
    -v "$REPO_ROOT/data:/app/data" \
    -v "$REPO_ROOT/www:/app/www" \
    "$DOCKER_IMAGE"

# ── Đợi server sẵn sàng ────────────────────────────────────
echo "⏳ Đợi server khởi động..."
for i in $(seq 1 30); do
    if nc -z 127.0.0.1 "$SERVER_PORT" 2>/dev/null; then
        echo "✅ Server sẵn sàng!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Server không khởi động sau 15 giây!"
        echo ""
        echo "📋 Log của container:"
        docker logs "$CONTAINER_NAME" 2>/dev/null || true
        exit 1
    fi
    sleep 0.5
done

# ── Chạy test ───────────────────────────────────────────────
echo ""
echo "🧪 Chạy integration tests (Minimal)..."
echo "============================================================"
python3 "$SCRIPT_DIR/test_connection.py" -v
python3 "$SCRIPT_DIR/test_admin_security.py" -v
python3 "$SCRIPT_DIR/test_crosslinks.py" -v
TEST_EXIT=$?

# ── Kết quả ─────────────────────────────────────────────────
echo ""
if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ Tất cả test passed!"
else
    echo "❌ Một số test failed (exit code: $TEST_EXIT)"
    echo ""
    echo "📋 Log của server:"
    docker logs "$CONTAINER_NAME" 2>/dev/null || true
fi

exit $TEST_EXIT
