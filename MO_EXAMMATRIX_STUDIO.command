#!/bin/zsh

APP_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
CLOUD_DIR="$APP_DIR/cloud"

pause_and_exit() {
  local msg="${1:-}"
  if [[ -n "$msg" ]]; then
    echo "$msg"
  fi
  if [[ "${EXAMMATRIX_NO_OPEN:-0}" != "1" ]]; then
    read -r "?Nhấn Enter để đóng."
  fi
  exit 1
}

PYTHON_BIN=""
for cand in \
  "$APP_DIR/.venv/bin/python" \
  "$CLOUD_DIR/.venv/bin/python" \
  "$HOME/.venvs/ngan-hang-de-web/bin/python"
do
  if [[ -x "$cand" ]] && "$cand" -c "import django" >/dev/null 2>&1; then
    PYTHON_BIN="$cand"
    break
  fi
done

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Chưa tìm thấy môi trường Python có cài Django để chạy ExamMatrix Studio."
  echo "Hãy tạo môi trường ảo và cài thư viện bằng các lệnh sau trong Terminal:"
  echo "  /opt/homebrew/bin/python3.11 -m venv \"$HOME/.venvs/ngan-hang-de-web\""
  echo "  \"$HOME/.venvs/ngan-hang-de-web/bin/python\" -m pip install -r \"$CLOUD_DIR/requirements.lock\""
  pause_and_exit
fi

START_PORT="${EXAMMATRIX_PORT:-8877}"
END_PORT=$((START_PORT + 10))
DATA_DIR="${CLOUD_DATA_DIR:-$CLOUD_DIR/var}"

PORT_INFO="$("$PYTHON_BIN" - "$START_PORT" "$END_PORT" <<'PY'
import json
import socket
import sys
import urllib.request

start_port = int(sys.argv[1])
end_port = int(sys.argv[2])
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

for port in range(start_port, end_port + 1):
    try:
        with opener.open(f"http://127.0.0.1:{port}/healthz", timeout=0.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("status") == "ok":
                    print(f"RUNNING:{port}")
                    sys.exit(0)
    except Exception:
        pass

for port in range(start_port, end_port + 1):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", port))
        print(f"FREE:{port}")
        sys.exit(0)
    except OSError:
        pass
    finally:
        sock.close()

sys.exit(2)
PY
)"
PORT_RC=$?

if [[ $PORT_RC -eq 0 && "$PORT_INFO" == RUNNING:* ]]; then
  PORT="${PORT_INFO#RUNNING:}"
  echo "ExamMatrix Studio đang chạy sẵn: http://127.0.0.1:$PORT/"
  if [[ "${EXAMMATRIX_NO_OPEN:-0}" != "1" ]]; then
    open "http://127.0.0.1:$PORT/"
  fi
  exit 0
elif [[ $PORT_RC -eq 0 && "$PORT_INFO" == FREE:* ]]; then
  PORT="${PORT_INFO#FREE:}"
else
  pause_and_exit "Các cổng $START_PORT–$END_PORT đang bận. Vui lòng đóng phiên cũ rồi mở lại."
fi

cd "$CLOUD_DIR" || pause_and_exit "Không tìm thấy thư mục cloud."

echo "Đang kiểm tra trạng thái cơ sở dữ liệu..."
if ! "$PYTHON_BIN" manage.py migrate --check >/dev/null 2>&1; then
  SHOULD_BACKUP=0
  if [[ -z "${DATABASE_URL:-}" ]]; then
    if "$PYTHON_BIN" - "$DATA_DIR/development.sqlite3" <<'PY'
import os
import sqlite3
import sys

db_path = sys.argv[1]
if not os.path.isfile(db_path) or os.path.getsize(db_path) == 0:
    sys.exit(1)

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
try:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='django_migrations' LIMIT 1"
    )
    sys.exit(0 if cur.fetchone() is not None else 1)
finally:
    conn.close()
PY
    then
      SHOULD_BACKUP=1
    fi
  fi

  if [[ $SHOULD_BACKUP -eq 1 ]]; then
    echo "Phát hiện bản cập nhật CSDL mới. Đang sao lưu an toàn vào cloud/var/backups/ (có thể mất 10–30 giây)..."
    if ! "$PYTHON_BIN" manage.py backup_local; then
      pause_and_exit "Sao lưu thất bại — đã hủy cập nhật để bảo vệ dữ liệu."
    fi
  fi

  echo "Đang cập nhật cấu trúc CSDL (migrate)..."
  if ! "$PYTHON_BIN" manage.py migrate --noinput; then
    pause_and_exit "Cập nhật CSDL thất bại."
  fi
fi

echo "=================================================="
echo "EXAMMATRIX STUDIO — NGÂN HÀNG ĐỀ & KHẢO THÍ (LOCAL)"
echo "Địa chỉ:   http://127.0.0.1:$PORT/"
echo "Đăng nhập: http://127.0.0.1:$PORT/accounts/login/"
echo "Đăng ký:   http://127.0.0.1:$PORT/accounts/signup/"
echo "Giữ cửa sổ này khi sử dụng. Nhấn Ctrl+C để dừng."
echo "=================================================="

SERVER_PID=""
WAITER_PID=""

cleanup() {
  if [[ -n "$WAITER_PID" ]] && kill -0 "$WAITER_PID" 2>/dev/null; then
    kill "$WAITER_PID" 2>/dev/null || true
    wait "$WAITER_PID" 2>/dev/null || true
  fi
  WAITER_PID=""
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

on_signal() {
  trap - INT TERM EXIT
  echo ""
  echo "Đã dừng ExamMatrix Studio."
  cleanup
  exit 0
}

trap cleanup EXIT
trap on_signal INT TERM

"$PYTHON_BIN" manage.py runserver "127.0.0.1:$PORT" --noreload &
SERVER_PID=$!

if [[ "${EXAMMATRIX_NO_OPEN:-0}" != "1" ]]; then
  "$PYTHON_BIN" - "$PORT" "$SERVER_PID" <<'PY' &
import json
import os
import subprocess
import sys
import time
import urllib.request

port = int(sys.argv[1])
server_pid = int(sys.argv[2])
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
url = f"http://127.0.0.1:{port}/healthz"

for _ in range(120):
    try:
        os.kill(server_pid, 0)
    except OSError:
        sys.exit(1)
    try:
        with opener.open(url, timeout=1.0) as resp:
            if resp.status == 200 and json.loads(resp.read().decode("utf-8")).get("status") == "ok":
                print("Đã sẵn sàng! Đang mở trình duyệt...", flush=True)
                subprocess.run(["open", f"http://127.0.0.1:{port}/"], check=False)
                sys.exit(0)
    except Exception:
        pass
    time.sleep(0.5)
sys.exit(1)
PY
  WAITER_PID=$!
fi

wait "$SERVER_PID"
RC=$?
SERVER_PID=""
cleanup

if [[ $RC -ne 0 && $RC -ne 130 && $RC -ne 143 ]]; then
  pause_and_exit "Máy chủ đã dừng bất thường (mã lỗi $RC)."
fi
