#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python cloud/manage.py migrate --noinput
exec gunicorn --chdir cloud config.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" --workers 1 --threads 2 --timeout 120 \
  --access-logfile - --error-logfile -
