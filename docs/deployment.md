# Deployment guide

The backend is one FastAPI process, PostgreSQL, and file or S3 storage. Rate
limits are in memory, so keep one uvicorn worker until they move to shared
storage.

## 1. Install

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
prisma generate
prisma migrate deploy
```

## 2. Configure

Copy `backend/.env.example` to `backend/.env` and set:

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT` — a fresh secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  The app refuses to start while it is empty.
- `STORAGE_BACKEND` — `local` for one machine, `s3` with `STORAGE_S3_BUCKET`
  for anything else.
- Optional: `ASKSIGHT_MODEL_CHECKPOINT`, `SARVAM_API_KEY`, `DEFAULT_LANGUAGE`.

Never commit the filled-in `.env`.

## 3. Start

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --proxy-headers --forwarded-allow-ips=<proxy ip>
```

Omit the two proxy flags when serving clients directly. Without them, every
request appears to come from the proxy and the 10-per-minute auth limit applies
to all users together.

Check `/health/live`, `/health/ready` and `/health/model` after starting.
`/health/ready` needs both the database and the inference service; with no
checkpoint configured the development mock reports ready.

## 4. Model checkpoint

Install the model package in the same environment and point the backend at a
verified checkpoint directory:

```bash
cd ../model
pip install -e .
python -m asksight_model.verify --checkpoint checkpoints/<version> --strict
```

Set `ASKSIGHT_MODEL_CHECKPOINT` to that directory. A QLoRA directory needs its
`adapter_config.json`; the backend loads the named base model and attaches the
adapter. Keep the Hugging Face cache (`HF_HOME`) on a persistent volume so
restarts do not re-download the backbones.

## 5. Checks

```bash
cd backend
python -m pytest -q
ruff check .
ruff format --check .
```
