#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python -m pip install -r cloud/requirements.lock
python cloud/manage.py collectstatic --noinput
python cloud/manage.py check --deploy --fail-level WARNING
