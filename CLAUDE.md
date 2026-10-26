# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Ngân hàng đề: a web app for Vietnamese teachers. It manages subjects and curricula, lessons with their learning outcomes (YCCĐ), a question bank (MC/ES), review guides (đề cương), test matrices with specification tables (ma trận/đặc tả), and generated exams. It exports Word, HTML, LaTeX/PDF and LMS files. The app is a multi-account Django site wrapped around an older single-user localhost app. It runs on Python 3.12 and is deployed to Render (free tier) with Neon PostgreSQL (`render.yaml`, `deploy/`).

This repo sits inside the teacher's Google Drive workspace. The parent folder holds the real question bank and the exam formatting rules (`../AGENTS.md`, `../rules/`). Those rules (numbering, landscape ≤ 24 cm tables, Times New Roman, logo only on đề cương, LMS answer marking) define what correct output from `exports.py`, `latex_generator.py` and `matrices/exports.py` looks like.

UI text, `ServiceError` messages and docs are in Vietnamese. Keep it that way.

## Commands

Run from the repo root unless a line says `cd cloud`. CI (`.github/workflows/tests.yml`) runs all of these, and runs the Django suite a second time against Postgres 16.

```sh
python3 -m venv .venv && .venv/bin/python -m pip install -r cloud/requirements.lock
cd cloud && ../.venv/bin/python manage.py migrate
cd cloud && ../.venv/bin/python manage.py runserver 127.0.0.1:8877        # then /accounts/signup/ → /app/

cd cloud && ../.venv/bin/python manage.py test --noinput                  # Django suite (cloud/tests/)
cd cloud && ../.venv/bin/python manage.py test tests.test_crud            # one module (or tests.test_crud.Class.test_x)
cd cloud && ../.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python -m unittest discover -s tests                            # engine suite (tests/, no __init__.py)
.venv/bin/python -m unittest discover -s tests -p test_backend.py         # one engine module
node tests/frontend.test.cjs && node tests/matrices_frontend.test.cjs     # frontend logic

cd cloud && ../.venv/bin/python manage.py seed_subject_samples --owner USER --dry-run   # then --apply (Toán10/Vật lí10)
cd cloud && ../.venv/bin/python manage.py import_legacy --owner USER --dry-run          # copy local JSON bank into an account
cd cloud && ../.venv/bin/python manage.py backup_local [--out DIR]                    # SQLite snapshot + LegacyState JSON + source files (DB and disk), then verify
cd cloud && ../.venv/bin/python manage.py verify_backup DIR
cd cloud && ../.venv/bin/python manage.py restore_local DIR --dry-run                # then --apply (current docs saved to version history first)
```

Some engine tests (`test_exam_verification`, `test_matrix_import`, `test_matrix_exports`) call `skipTest` when the teacher's private source files under `../06_Kiem_tra_va_Danh_gia/` are missing. That happens on CI, so a skip is not a pass. `scripts/export_and_verify_samples.py` and `verify_step2_1.py` produce real DOCX/PDF exports (through `/Library/TeX/texbin/xelatex`) so you can inspect the layout by eye.

## Architecture

**One engine, two hosts.** The business logic lives in the top-level modules:
- `bank_service.py` (`BankService`: questions, PPCT, revisions, exam generation, permutation/verification)
- `matrices/` (`MatrixService`: model, Word import, exchange, generation, exports, HTTP routes)
- `exports.py` (DOCX/HTML/LMS)
- `latex_generator.py` + `latex_layout.py`
- `docx_exam_importer.py`
- `input_schema.py`
- `domain/policies.py`
- `ai_assistant.py` (Gemini; key only from server env `GEMINI_API_KEY`, sent in the `x-goog-api-key` header; daily per-account quota `AI_DAILY_LIMIT`; AI routes run outside the Django workspace lock; AI questions are saved only as drafts via `/api/ai/save-drafts`)

`server.py` `Handler` is the single place where `/api/*` routes are handled. It is a stdlib `BaseHTTPRequestHandler` with a long chain of `if path == '/api/...'`.
- **Legacy host:** `start.py` / `MO_NGAN_HANG_DE.command` runs `create_server()` on 127.0.0.1:8765–8775 against JSON files in `data/`, plus the real bank at `DEFAULT_BANK`.
- **Django host:** `cloud/manage.py` puts the repo root on `sys.path`. `cloud/assessment/legacy_views.py` `original_api` wraps each request in `transaction.atomic()` with a `select_for_update` lock on the teacher's `Workspace`. It then builds a `DjangoHandler` (a subclass of `Handler` that overrides `_body`, `_send`, `_json` and `_local_request`) and calls `do_GET`/`do_POST`. Django itself handles only auth, CSRF, scoping and storage. Add or change API features in `server.py` and the engine, never as separate Django views.

**Storage swap.** `BankService` reads and writes fixed JSON paths: `bank.json`, `exams.json`, `revisions.json`, `exam_templates.json`, `matrices/records.json`. Under Django, `cloud/assessment/legacy_storage.py` `DatabaseStorage` maps each path to a key in `LegacyState.documents` for the account and curriculum, saving a `LegacyStateVersion` before every write. Any other path raises a 403 `ServiceError`, so a new persisted file needs a new key in that map. Uploaded source files are stored as `StoredSource` rows in the database (8 MB per file, 128 MB per account), because the web disk on Render is ephemeral.

**Scoping.** Each request runs either on the original Tin học 8–10 data (`legacy`) or on one `workspace.Curriculum`. The frontend adds `?curriculum=<id>` to every call through `core.scopedUrl`. The id comes from the `<meta name="curriculum-id">` tag that `legacy_views.application` injects into `public/index.html`, along with the CSRF token. `course_context()` adds `subject_name` and `allowed_grades` to `/api/state` and to the bank's `ppct._context`. **Test mode** is triggered by the `X-Test-Mode: 1` header or `?test_mode=1`. It routes to a separate sandbox bank that starts empty: `setup_test_sandbox` for the legacy host, `reset_test_bank` for Django.

**Frontend** is buildless vanilla JS in `public/`: `index.html`, `app.js` (main UI), `matrices.js`, `curricula.js`, and `core.js`. `core.js` holds the pure helpers in UMD form, so Node tests can `require('../public/core.js')`. Put logic you want tested into `core.js`. Django serves only a whitelisted set of these assets (`legacy_views.source_asset` plus the `re_path` in `cloud/config/urls.py`), so add a new JS/CSS file to both places. The legacy server sends a strict CSP (`script-src 'self'`), which means no inline scripts.

**Django apps** (`cloud/`):
- `accounts`: signup/login, per-account limits
- `workspace`: Subject/Curriculum CRUD with trash and restore. REST lives at `/api/subjects/` and `/api/curricula/`, uses an `expected_revision` optimistic-concurrency check, and allows owner-only access via `workspace.access.workspace_for`.
- `assessment`: the legacy bridge, storage and sample packs
- `documents`

## Domain invariants (tests enforce these; see `docs/THIET_KE.md`)

- A generated exam totals exactly 10 points with no duplicate questions. At least `ceil(0.9 × n)` of its questions must match the hash snapshot of the selected đề cương revision.
- Grades 8 and 10 periodic exams (GK1/CK1/GK2/CK2) require a locked source matrix template whose rows cannot be edited. Grade 9 and TX exams allow custom blueprints. PPCT period windows filter the eligible lessons.
- Shortfalls return HTTP 400 with `details`. The engine never relaxes level or lesson to fill a gap. True/False and short-answer types are not supported yet: report them as unsupported and never convert them to MC.
- The student export never includes answers, rubrics, `correct` values or hidden feedback. Saved exams and revisions are snapshots and do not follow later bank edits. PPCT and source matrices are read-only inputs.
- Errors have the shape `{error, details?}` and use the right 400/403/404/409 status.

## Config and data hygiene

- Production config comes only from environment variables: `APP_ENV=production`, `DJANGO_SECRET_KEY` (≥ 50 chars), `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CLOUD_DATA_DIR`, and `TRUST_HTTPS_PROXY`. The proxy flag is safe only behind a trusted proxy.
- With no `DATABASE_URL`, the app uses SQLite at `cloud/var/development.sqlite3`.
- `deploy/build.sh` runs `check --deploy --fail-level WARNING`, so a deploy warning breaks the build.
- `.gitignore` excludes `data/`, `cloud/var/`, backups, `.env*`, and all `.docx/.pdf/.xlsx/.zip`. Real teacher banks and exams must never enter git, and every fixture must be self-written sample content.
- `acceptance/<date>-*/` holds acceptance-run records: scripts, logs and results.
