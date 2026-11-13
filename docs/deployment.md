# AskSight Deployment Architecture and Production Rollout Plan

This document details the production deployment strategy for the **AskSight Backend API** and the **AskSight Multimodal Model (LLaVA-style Connector + Qwen2.5 / CLIP)**.

---

## 1. System Architecture Overview

AskSight consists of three core computational boundaries:
1. **Frontend / Mobile UI**: Flutter/web client interacting via REST/JSON with JWT authentication.
2. **Backend API (FastAPI)**: Asynchronous REST application handling authentication, session tokens, image metadata, query history, media uploads, and delegating inference.
3. **Model Inference Worker / Service**: Model pipeline loading CLIP (`openai/clip-vit-base-patch32`), Qwen2.5-1.5B-Instruct, and the trained projection adapter weights (`projector.safetensors`).
4. **Data & Storage Layer**:
   - **PostgreSQL**: Stores relational data (`User`, `Session`, `Image`, `HistoryEntry`).
   - **S3-Compatible Object Storage** (AWS S3 / Cloudflare R2 / MinIO): Durable storage for raw image bytes.

```
       [ Client / Mobile UI ]
                 │
                 ▼ (HTTPS / TLS)
       [ Reverse Proxy / Ingress ]
                 │
                 ▼
       [ Backend API (FastAPI) ]
         │          │         │
         │          │         ▼
         │          │   [ S3 Storage / MinIO ] (Raw image bytes)
         │          ▼
         │     [ PostgreSQL ] (Prisma ORM)
         ▼
  [ Model Inference Service ]
  (Direct in-process on GPU worker OR via Private RPC / HTTP)
```

---

## 2. Component Readiness & Verification Audit

Prior to creating this plan, both codebase modules were audited and verified:
- **Backend**:
  - 191 unit tests passing (`191 passed`, plus 2 environment-gated skips:
    the fresh-Postgres integration test needs Docker, the real Sarvam smoke
    test needs `SARVAM_API_KEY`), proving the init migration applies to an
    empty database.
  - Code hygiene, ruff linter checks passing cleanly.
  - Pluggable storage abstraction verified: `LocalStorage` for local dev/testing, `S3Storage` (via `boto3`) for production.
  - Keyset pagination, session rotation, security tokens, request tracing (`x-request-id`), structured logging, per-phase latency logs, rate limits, and `/health/live` & `/health/ready` endpoints operational.
  - Redundant directories (such as empty `backend/app/db/` directory leftover from migration) cleaned.
- **Model**:
  - 55 unit and robustness tests passing (`55 passed`).
  - Checkpoint integrity manifest verification (`asksight_model.verify`) with SHA-256 validation.
  - Concurrency control, bounded generation, warmup routine, and queue timeout mechanisms in `LocalInferenceService`.

---

## 3. Deployment Topology Options

Depending on operational scale and budget, two primary deployment architectures are supported:

### Option A: Decoupled GPU Microservice Architecture (Recommended for Production / Cloud)
- **Backend API**: Deployed on scalable CPU instances (e.g. AWS ECS Fargate, Kubernetes, or DigitalOcean / GCP Cloud Run).
- **Model Inference**: Deployed on dedicated GPU instances (e.g. AWS EC2 `g4dn.xlarge` / `g5.xlarge`, RunPod, Lambda Labs, or GCP `g2-standard-4` with NVIDIA L4 or T4/A10G).
- **Communication**: Backend communicates with the model serving endpoint over an internal VPC network (via FastAPI model server or Triton/vLLM adapter).
- **Pros**: Independent scaling, CPU instances handle web/I/O traffic cheaply, GPU instances scale strictly on demand.

### Option B: Monolithic GPU Node (Cost-Effective / MVP)
- Backend and Model run on the same virtual server with an attached GPU (e.g. single AWS `g4dn.xlarge` or Hetzner GPU server).
- Backend loads `LocalInferenceService(checkpoint_dir)` directly into memory via `ASKSIGHT_MODEL_CHECKPOINT`.
- **Pros**: Zero network overhead between API and model, simplest setup, lowest initial infrastructure bill.

---

## 4. Production Deployment Checklist & Step-by-Step Plan

### Phase 1: Database Setup & Migration
1. **Provision Managed PostgreSQL** (AWS RDS, Supabase, Neon, or self-hosted PostgreSQL >= 15).
2. **Execute Prisma Migrations**:
   ```bash
   cd backend
   DATABASE_URL="postgresql://user:pass@host:5432/asksight?sslmode=require" prisma migrate deploy
   ```
   A **fresh** database needs nothing more. If the target already contains
   the original `User` table (e.g. the existing Neon dev database), baseline
   it once before the first deploy:
   ```bash
   prisma migrate resolve --applied 20261111000000_init
   ```
   then run `migrate deploy` as above; future migrations apply normally.
3. **Verify Connectivity**:
   Confirm `/health/ready` returns HTTP 200 `{"status": "ok", "checks": {"database": "ok"}}`.

### Phase 2: Object Storage Setup
1. Create an S3 bucket (e.g. `asksight-media-prod`).
2. Configure bucket access policies (private access only, no public bucket listing).
3. Set environment variables:
   ```env
   STORAGE_BACKEND=s3
   STORAGE_S3_BUCKET=asksight-media-prod
   STORAGE_S3_PREFIX=uploads
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=<PROD_KEY>
   AWS_SECRET_ACCESS_KEY=<PROD_SECRET>
   ```

### Phase 3: Model Checkpoint Preparation & Packaging
1. **Train / Finalize Checkpoint**:
   Ensure training completes and outputs to `checkpoints/<release-tag>/`.
2. **Verify Checkpoint**:
   ```bash
   python -m asksight_model.verify checkpoints/<release-tag> --strict
   ```
   Ensures `manifest.json`, `config.yaml`, and `projector.safetensors` match expected cryptographic hashes.
3. **Ship Checkpoint to Production Artifact Storage**:
   Upload checkpoint directory to S3 or model registry:
   ```bash
   aws s3 sync checkpoints/<release-tag>/ s3://asksight-models/<release-tag>/
   ```
4. **Download on GPU Host at Startup**:
   The GPU worker downloads the checkpoint on boot or container build.

### Phase 4: Containerization & Dockerfile Specifications

#### A. Backend Dockerfile (`backend/Dockerfile`)
```dockerfile
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY prisma ./prisma
RUN prisma generate

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

#### B. Model Inference Dockerfile (`model/Dockerfile`)
```dockerfile
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY pyproject.toml .
COPY asksight_model ./asksight_model
RUN pip3 install --no-cache-dir .

# Pre-cache Hugging Face base models (CLIP + Qwen2.5) during build
ENV HF_HUB_ENABLE_HF_TRANSFER=0
RUN python3 -c "from transformers import AutoTokenizer, AutoModelForCausalLM, CLIPVisionModelWithProjection, CLIPImageProcessor; \
    AutoTokenizer.from_pretrained('Qwen/Qwen2.5-1.5B-Instruct'); \
    AutoModelForCausalLM.from_pretrained('Qwen/Qwen2.5-1.5B-Instruct'); \
    CLIPVisionModelWithProjection.from_pretrained('openai/clip-vit-base-patch32'); \
    CLIPImageProcessor.from_pretrained('openai/clip-vit-base-patch32')"

EXPOSE 8001

CMD ["python3", "-m", "uvicorn", "asksight_model.service_app:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## 5. Environment Configuration Summary

The authoritative, annotated reference is `backend/.env.example` — keep them
in sync.

| Variable | Description | Production Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (read by Prisma) | `postgresql://usr:pwd@db.host:5432/asksight?sslmode=require` |
| `JWT` | HS256 signing secret, ≥ 32 random bytes. The app refuses to start without it | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ASKSIGHT_MODEL_CHECKPOINT` | Path to verified checkpoint dir; empty = development mock | `/models/v0.1-release` |
| `STORAGE_BACKEND` | `local` (development) or `s3` (production) | `s3` |
| `STORAGE_ROOT` | Image directory for the local backend, relative to `backend/` | `storage` |
| `STORAGE_S3_BUCKET` | Bucket name — required when `STORAGE_BACKEND=s3` | `asksight-media-prod` |
| `STORAGE_S3_PREFIX` | Optional key prefix inside the bucket | `uploads` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Standard boto3 credential chain (or an instance IAM role) | `ap-south-1` |
| `ASKSIGHT_LOG_LEVEL` | Structured JSON log level: `DEBUG`/`INFO`/`WARNING`/`ERROR` | `INFO` |
| `SARVAM_API_KEY` | Server-side speech key; empty = `/stt` and `/tts` answer 503 | (secret) |
| `SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL` | Provider model names | `saaras:v4`, `bulbul:v4-flash` |
| `DEFAULT_LANGUAGE` | Default speech language (BCP-47) | `en-IN` |

Not environment variables — they are code constants: the 30-minute access
token and 30-day refresh token lifetimes, the 10 MB upload cap, the 40 MP
pixel cap, and the `/ask` 30-second timeout.

**Rate limits and workers:** limits are in-memory per process. Running
`uvicorn --workers N` multiplies them by N (each worker counts its own
traffic). Use a single worker, or move the limiter to shared storage, if
exact limits matter.

---

## 6. Monitoring, Health Checks & Observability

1. **Kubernetes / Load Balancer Health Probes**:
   - Liveness Probe: `GET /health/live` (Interval: 10s, Timeout: 2s)
   - Readiness Probe: `GET /health/ready` (Interval: 15s, Timeout: 3s)
2. **Metrics**:
   - Track request latencies and response codes tagged with `x-request-id`.
   - Monitor GPU utilization (`nvidia-smi` exporter), VRAM consumption, and inference queue wait times.
3. **Structured Logging**:
   - JSON structured logging is already integrated in `backend/app/core/middleware.py`. Logs forward directly to Datadog, CloudWatch, or Grafana Loki.

---

## 7. Rollback & Disaster Recovery Strategy

1. **Blue/Green or Rolling Deployment**:
   - Roll out new backend versions only after `/health/ready` verifies database connectivity and schema migrations.
2. **Database Migrations**:
   - Ensure Prisma migrations remain backward-compatible (expand before contract).
3. **Model Version Fallback**:
   - Maintain the previous verified model checkpoint in object storage. If a newly deployed checkpoint exhibits degradation, update `ASKSIGHT_MODEL_CHECKPOINT` to the previous version and restart the inference container.
