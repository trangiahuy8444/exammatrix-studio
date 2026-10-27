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
- `exports.py` (DOCX/HTML/LMS). PDF is converted from the same DOCX by Microsoft Word (`pdf_build.docx_to_pdf`, AppleScript, temp files in Word's sandbox container), so PDF and Word are identical; with no Word installed (e.g. Render) PDF export returns 400. Fix layout in the DOCX code only. `fmt='tex'` still uses the LaTeX generators. Set `WORD_PDF_TESTS=1` to run the real Word conversion test.
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
- Revision criterion (B6, `domain/revision_criterion.py`, school rule `rules/01`): T = (exact matches + approved close matches) / total questions ≥ 90% (count is decisive; points % is reference only) and YCCĐ coverage must be 100% of points. Exact = same normalized content as a revision question (`exact_hash`/`content_hash`, so permuted codes count). Close matches are marked per question with source question + reason (`mark_close_match`) and count only after `review_close_match(..., 'approve')`; `revision_policy='chi_trung'` counts exact only. The report is kept in admin field `revision_check` (outside `exam_hash`); failing T or coverage blocks exam approval.
- Grades 8 and 10 periodic exams (GK1/CK1/GK2/CK2) require a locked source matrix template whose rows cannot be edited. Grade 9 and TX exams allow custom blueprints. PPCT period windows filter the eligible lessons.
- Shortfalls return HTTP 400 with `details`. The engine never relaxes level or lesson to fill a gap, and never converts a type (e.g. True/False) into MC.
- Profiles and scoring (B3, `domain/profiles.py`, `domain/scoring.py`): allowed types come from the profile (THCS: MC, ES; THPT/GENERAL: MC, YN, SHORT, ES) or the record's `allowed_kinds` (KTTX/custom). YN/SHORT slots generate automatically when the whole question is one lesson and level. Đ/S score = max points × coefficient by correct statements (default `{0:0,1:0.1,2:0.25,3:0.5,4:1}`, blank/both/invalid = wrong), all in `Decimal`; totals round half-up by exam type: GK/CK to 0.1, TX to an integer (`rounding_for`; TT 22/2021, Điều 5 + tổ convention 27/10/2026). `allowed_kinds` and `scoring_policy` are stored on the matrix (hashed only when present, so old locked matrices keep their digest) and copied into the exam. `ServiceError` lives in `domain/errors.py` (re-exported by `bank_service`).
- The student export never includes answers, rubrics, `correct` values or hidden feedback. Saved exams and revisions are snapshots and do not follow later bank edits. PPCT and source matrices are read-only inputs.
- Errors have the shape `{error, details?}` and use the right 400/403/404/409 status.
- Question review (B1, `domain/review.py`): `draft → pending_review → approved` plus `needs_review`/`archived`; legacy `content_checked` reads as `pending_review`. Only `BankService.review_question(..., 'approve', checklist=...)` reaches `approved`; saving never does, and editing a `REVIEW_FIELDS` field of an approved question moves it to `needs_review`. Official exams use only `EXAM_ELIGIBLE = ('approved',)`.
- Exam lifecycle (B2, `domain/exam_lifecycle.py`): `drafting → pending_approval → locked → published` via `exam_transition`. Approve requires every exam question to be approved and equal to its approved version (`version_hash`, order-independent); it stores `approved_hash = exam_hash(exam)`. Publish is refused (409, logged as `publish_blocked`) if the hash changed. Locked/published exams cannot be updated, re-scored or deleted; `new_revision` makes an unapproved copy. Copies and permuted codes never inherit approval.
- Matrix checks (B4, `domain/matrix_checks.py`): `cell_check` compares exam vs matrix per cell (lesson × PPCT outcome × type × level; questions per slot, points per part) and runs in `verify_exam` and in exam approval (a mismatched cell blocks `approve`). `ratio_warnings` warns only (never blocks) for THPT periodic matrices when type/level points deviate from the CV 7991 reference (MC 3, ĐS 2, TLN 2, TL 3 — TLN unused moves to ĐS; Biết 4, Hiểu 3, VD 3) by more than `ratio_tolerance` (default 0.5, an internal threshold).
- Reuse warnings (B5, `domain/reuse.py`): `exact_hash` (NFC, casefold, collapsed spaces, options/statements sorted) detects verbatim duplicates; `recent_uses` lists questions (same id or same content) already in exams **published** within `DEFAULT_RECENT_DAYS` (365), ignoring the exam itself and its permuted siblings. Warnings never block: they are stored in the admin field `reuse_check` (excluded from `exam_hash`) on generation and approval, appear in `verify_exam` as `reuse_warnings`, as `recently_used` on matrix candidates, and as `duplicates` in the question-save response.
- Permutation (B7, `domain/permutation.py`): codes only reorder questions/options (Đ/S statements stay a–d unless `shuffle_statements=True`, which keeps the part↔requirement mapping). `verify_codes` checks every code has the parent's question set, per-question points and `version_hash`; any problem raises 409 and nothing is saved. `mapping_rows` (code, position, source slot, question id, answer after permutation, source answer, points) is returned as `mapping`, exported by `export_mapping_docx`, included in the bundle as `Bang_doi_chieu_ma_de.docx`, and served at `/api/exams/<id>/mapping.docx` behind `_require_answers`.
- Answers (B2): every answer-bearing download goes through `Handler._require_answers` (403 + audit when denied; audit when allowed), and `_json` strips answer fields (`domain/answer_access.redact_answers`) for accounts without permission. Django denies accounts in group `khong_xem_dap_an`; denied-access audit events are written after the rolled-back transaction.

## Config and data hygiene

- Production config comes only from environment variables: `APP_ENV=production`, `DJANGO_SECRET_KEY` (≥ 50 chars), `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CLOUD_DATA_DIR`, and `TRUST_HTTPS_PROXY`. The proxy flag is safe only behind a trusted proxy.
- With no `DATABASE_URL`, the app uses SQLite at `cloud/var/development.sqlite3`.
- `deploy/build.sh` runs `check --deploy --fail-level WARNING`, so a deploy warning breaks the build.
- `.gitignore` excludes `data/`, `cloud/var/`, backups, `.env*`, and all `.docx/.pdf/.xlsx/.zip`. Real teacher banks and exams must never enter git, and every fixture must be self-written sample content.
- `acceptance/<date>-*/` holds acceptance-run records: scripts, logs and results.
