# Deploying AskSight on one AWS EC2 GPU host

This is the smallest deployment that runs the **real** model with the code as it
is today. The backend imports `LocalInferenceService` in-process, so backend and
model must live on the same box.

```
Route 53 / ACM
    -> ALB (public subnets, 443)
        -> EC2 g5.xlarge (private or public subnet, port 8000)
             uvicorn, 1 worker + Qwen3-VL-4B 4-bit in the same process
        -> RDS PostgreSQL (private subnets, 5432)
        -> S3 (image bytes, via instance role)
SSM Parameter Store -> /etc/asksight.env -> systemd
HF cache -> local EBS at /opt/asksight/hf-cache
```

`shortcut: one host and one inference slot; move to ECS Fargate + a SageMaker endpoint when you need more than one concurrent /ask or hands-off scaling.`

## Why these choices

- **g5.xlarge (L4, 24 GB VRAM)** has native bf16 and comfortably fits Qwen3-VL-4B
  in 4-bit. `g4dn.xlarge` (T4) is cheaper but slower. The engine uses
  `bitsandbytes` 4-bit only when CUDA is available; without a GPU it silently
  loads full precision on CPU and will not meet the latency target.
- **One uvicorn worker**: rate limits and the model semaphore are in-process.
  More workers would give every user their own limit and load the model N times.
- **Local HF cache**: the first start downloads several GB of weights. Keep
  `HF_HOME` on the instance disk so restarts and redeploys do not re-download.

## 1. AWS resources (one-time)

1. **VPC**: two public + two private subnets, internet gateway. Use a NAT
   gateway only if the EC2 host is private; it needs outbound access to Hugging
   Face on first boot. For a demo, a public subnet with a locked-down SG is fine.
2. **Security groups**:
   - `alb`: inbound 80/443 from the internet, outbound all.
   - `api`: inbound 8000 from `alb` only; inbound 22 from your IP (or no SSH —
     use SSM Session Manager). Outbound 443.
   - `db`: inbound 5432 from `api` only.
3. **RDS**: PostgreSQL 16, `db.t4g.micro`, 20 GB gp3, private subnets,
   encryption on, backups 7 days. Do not make it publicly accessible.
4. **S3**: one private bucket, block all public access, default encryption.
   Enable versioning if you care about accidental deletes.
5. **IAM instance profile** attached to the EC2 host, with:
   - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`
   - `ssm:GetParameter` on your `/asksight/*` parameters
   - `ssm:SendCommand` / Session Manager policy if you skip SSH
   No access keys go on the box; `boto3` uses this role.
6. **SSM Parameter Store** (type `SecureString`) for `DATABASE_URL`, `JWT`,
   `SARVAM_API_KEY`, and plain `String` for the bucket name. Generate the JWT
   with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## 2. Launch the instance

- AMI: **Deep Learning Base GPU AMI (Ubuntu)** — NVIDIA driver and
  `nvidia-container-toolkit` already installed.
- Type: `g5.xlarge`. Storage: 100 GB gp3 root volume (the HF cache and venv are
  small enough to live there for a single-host deploy).
- Attach the `api` security group and the IAM instance profile from step 1.
- Verify the GPU before installing anything: `nvidia-smi`.

## 3. Install the app

```bash
sudo mkdir -p /opt/asksight && sudo chown "$USER:$USER" /opt/asksight
cd /opt/asksight
git clone <your-repo-url> AskSight
cd AskSight/backend

python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# CUDA wheel matching the AMI driver; use the selector at pytorch.org if cu126 is wrong
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -e model             # pulls transformers, peft, bitsandbytes, opencv
prisma generate                     # generates the async Prisma client
```

The backend finds `model/` next to its own package, so keep it at
`/opt/asksight/AskSight/backend/model`.

Write the runtime env once. `load_dotenv()` does not override variables already
set by systemd, so this file is the source of truth:

```bash
PARAM() { aws ssm get-parameter --region ap-south-1 --name "$1" \
  --with-decryption --query Parameter.Value --output text; }

sudo tee /etc/asksight.env >/dev/null <<EOF
DATABASE_URL="$(PARAM /asksight/DATABASE_URL)"
JWT="$(PARAM /asksight/JWT)"
SARVAM_API_KEY="$(PARAM /asksight/SARVAM_API_KEY)"
STORAGE_BACKEND=s3
STORAGE_S3_BUCKET="$(PARAM /asksight/S3_BUCKET)"
STORAGE_S3_PREFIX=uploads
AWS_REGION=ap-south-1
ASKSIGHT_MODEL_CHECKPOINT=Qwen/Qwen3-VL-4B-Instruct
HF_HOME=/opt/asksight/hf-cache
ASK_TIMEOUT_SECONDS=30
DEFAULT_LANGUAGE=en-IN
EOF
sudo chown ubuntu:ubuntu /etc/asksight.env
sudo chmod 600 /etc/asksight.env
```

`ASKSIGHT_MODEL_CHECKPOINT` accepts a Hugging Face id or an **absolute** path to
a QLoRA adapter directory. Relative paths resolve from the working directory,
so use absolute paths for adapters. Leave it empty only if you deliberately
want the mock.

Apply migrations once before the first start:

```bash
cd /opt/asksight/AskSight/backend
set -a && . /etc/asksight.env && set +a
.venv/bin/prisma migrate deploy
```

The connection string must include `?sslmode=require`.

## 4. Run it as a service

`/etc/systemd/system/asksight.service`:

```ini
[Unit]
Description=AskSight API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/asksight/AskSight/backend
EnvironmentFile=/etc/asksight.env
ExecStart=/opt/asksight/AskSight/backend/.venv/bin/python -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 --workers 1 \
  --proxy-headers --forwarded-allow-ips=10.0.0.0/8
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Replace `10.0.0.0/8` with your VPC CIDR. Without `--proxy-headers`, the ALB's
address is used for the per-IP auth limit and all users share one 10/min bucket.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now asksight
journalctl -u asksight -f
```

The first start downloads the weights into `$HF_HOME`; this can take several
minutes. Startup loads the model in the FastAPI lifespan before serving, so the
port stays closed until it is ready.

## 5. Put an ALB in front

- Target group: `instance`, port `8000`, VPC of the EC2 host.
- Health check: `GET /health/live`, interval 30 s, timeout 10 s, healthy
  threshold 2. `/health/live` stays green during a DB outage; `/health/ready`
  checks the DB **and** the model and is for verification, not ALB routing.
- Listener: 443 with an ACM certificate; redirect 80 to 443.
- Add the `alb` security group to the `api` inbound rule. Keep port 8000 off
  the public internet.
- Point your DNS name at the ALB. The Expo app needs this base URL in its API
  config; no CORS proxy is needed if the app calls the ALB directly.

## 6. Verify

```bash
curl https://<your-domain>/health/live
curl https://<your-domain>/health/ready
curl https://<your-domain>/health/model   # model_version, startup_seconds, latency p50/p95
nvidia-smi                                 # process should hold GPU memory
```

Then sign up, upload an image, and make one `/ask` request. Check
`/health/model` for `latency_median_s` on the real host — do not quote Colab
numbers as deployment latency. Keep `/metrics` internal (do not expose it on
the ALB).

## 7. Updates

```bash
cd /opt/asksight/AskSight
git pull
cd backend
. .venv/bin/activate
pip install -r requirements.txt && pip install -e model && prisma generate
set -a && . /etc/asksight.env && set +a
.venv/bin/prisma migrate deploy
sudo systemctl restart asksight
```

If you change a secret, rewrite `/etc/asksight.env` and restart.

## Limits and next step

- One `/ask` at a time; the second request waits up to 30 s then gets 504.
  `ASK_TIMEOUT_SECONDS` and the service's `queue_timeout_s` are both 30 s.
- Rate limits reset on restart and do not span hosts. Adding a second EC2 host
  behind the ALB is not safe until those limits move to shared storage.
- There is no GPU on ECS Fargate and Lambda is a poor fit for multi-GB weights;
  the scale-out path is **ECS Fargate for the backend + a SageMaker GPU
  endpoint for the model**, which needs an HTTP client around the existing
  `answer(image, question)` protocol.
- Rough running cost: the GPU instance is the dominant item (a few tenths to
  about a dollar per hour depending on family and region), plus RDS, EBS, and
  ALB. Stop or downsize the instance when nobody is using it.
