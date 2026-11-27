# AskSight Backend

FastAPI backend for image uploads, visual question answering, authentication,
history, and speech services.

## Requirements

- Python 3.12+
- PostgreSQL
- A configured `DATABASE_URL`

The backend can run without the trained model by using its development mock
inference service.

## Local setup

From the repository root:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
JWT="a-long-random-secret-at-least-32-characters"
```

Generate a suitable JWT secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Do not commit `.env` or put real credentials in documentation.

## Database setup

Generate the Prisma client and apply migrations:

```bash
prisma generate
prisma migrate deploy
```

For an existing database that already contains the initial `User` table but
does not have Prisma migration history, baseline the initial migration once,
then deploy all later migrations. The follow-up migration creates the missing
`Session` table required by login:

```bash
prisma migrate resolve --applied 20261111000000_init
prisma migrate deploy
```

## Run the API

With the virtual environment activated:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Behind Nginx or another reverse proxy, add `--proxy-headers
--forwarded-allow-ips=<proxy ip>` so the per-IP limits use the real client
address instead of the proxy's.

The API is available at <http://localhost:8000>.

Expo web calls the API from a browser. `CORS_ORIGINS` controls which origins
are allowed (comma-separated; default `*`, which is fine for local development
because requests use bearer tokens, not cookies).

- Swagger UI: <http://localhost:8000/docs>
- Liveness: <http://localhost:8000/health/live>
- Readiness: <http://localhost:8000/health/ready>
- Model status: <http://localhost:8000/health/model>
- Prometheus metrics: <http://localhost:8000/metrics> (keep this internal)

`/health/ready` requires both the database and inference service to be
available.

## Model options

By default, the backend uses a development mock and `/ask` returns an answer
starting with `[mock answer]`.

To load a trained checkpoint, install the model package in its own environment
or in the backend environment:

```bash
cd model
pip install -e .
```

Then set the checkpoint path in `backend/.env`, for example:

```env
ASKSIGHT_MODEL_CHECKPOINT=model/checkpoints/qwen3_vl_qlora
```

The directory can hold a full Hugging Face model or a QLoRA adapter plus its
`adapter_config.json`; the base model is read from that config.

Restart the backend after changing environment variables.

## Tests and checks

From `backend/`:

```bash
python -m pytest -q
ruff check .
ruff format --check .
```

## Related documentation

- [API contracts](../docs/api-contracts.md)
- [Deployment guide](../docs/deployment.md)
