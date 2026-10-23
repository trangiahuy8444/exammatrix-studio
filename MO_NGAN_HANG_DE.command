#!/bin/zsh
APP_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
BUNDLED_PYTHON="/Users/huytran/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [[ -x "$BUNDLED_PYTHON" ]]; then
  PYTHON_BIN="$BUNDLED_PYTHON"
else
  PYTHON_BIN="$(command -v python3)"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Chưa tìm thấy Python 3 để chạy ứng dụng."
  read -r "?Nhấn Enter để đóng."
  exit 1
fi
"$PYTHON_BIN" "$APP_DIR/start.py"
