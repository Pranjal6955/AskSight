# PLAN

Implementation plan for the AskSight multimodal architecture: **CLIP vision encoder + projection
layer + LLM**, trained and evaluated on **VQA v2**, served through `POST /ask`.

## Files

| File | What it is |
|---|---|
| [`Architecture.md`](./Architecture.md) | The technical contract. Every model dimension, hyperparameter, file path, prompt template, metric definition and gotcha. Written to be read start to finish before you write code |
| [`Task.md`](./Task.md) | 47 ordered tasks across 11 phases. Each task ends with a `Verify` command that passes or fails |

## Read in this order

1. `Architecture.md` §1–§6 — goals, system design, model spec, prompt format, the accuracy metric,
   the data pipeline.
2. `Architecture.md` §13 — **the gotchas table.** Sixteen failures that cost hours or days, with
   their exact symptom. Read this one twice.
3. `Task.md` — then work it top to bottom.

## Current state of the repo

Grounded in the actual repository as of this commit:

| Thing | Status |
|---|---|
| `backend/app/main.py` | FastAPI app with `GET /health` and a Prisma lifespan. Nothing else |
| ML code | **None.** No torch, no CLIP, no model loading, no training, no notebooks |
| `POST /ask` | **Does not exist.** Only `/health` is registered |
| `ml/` | **Does not exist**, despite `README.md:44` referencing it |
| `frontend/`, `docker-compose.yml` | Referenced in the README; actual directory is `ui/` (Expo/React Native), no compose file |
| `prisma/schema.prisma` | `QueryLog` model exists, but **no migrations have ever been created** and no code writes to it |
| `ui/` | Expo app with NativeWind, Expo Router, tests, lint and typecheck |
| CI | `.github/workflows/backend-ci.yml`: `ruff check`, `ruff format --check`, `pytest` |

The README's "Built on a LLaVA-style multimodal architecture … trained and evaluated on VQA v2" is
**aspiration, not a description.** This plan is what turns it into a description.

## The five decisions that shape everything else

1. **Python 3.11, one virtualenv.** The current `backend/venv` is 3.14 and cannot hold torch wheels.
2. **`requirements-ml.txt` is separate from `requirements.txt`.** Torch is ~800 MB; adding it to
   the CI dependency list will time out the existing two-minute pipeline.
3. **The VQA accuracy metric lives in `backend/app/ml/answer_postprocess.py`, importing only `re`.**
   One implementation, shared by training, evaluation and the API, and still testable in CI without
   a single ML dependency installed.
4. **Prompt-masked loss** (loss on answer tokens only), a deliberate deviation from LLaVA-1.5's
   original SFT script.
5. **Train on `val`, submit to `test-dev2015`.** `val` is the number you controlled; `test-dev2015`
   is a one-shot EvalAI upload.

## Scale

| | |
|---|---|
| Trainable parameters | ~181 M (21 M projector + 160 M LoRA) of 7.0 B |
| Trainable fraction | 2.5 % |
| Training data | 443,757 questions over 123,287 COCO images (19 GB) |
| Optimiser steps | 13,868 (1 epoch, effective batch 32) |
| GPU wall clock | 9–13 h on A100-40GB; ~40 h on RTX 3090 |
| Hands-on effort | ~47 h across 47 tasks |
| Target accuracy | ≥ 68 % VQAv2 val accuracy vs. ~25 % for the always-"yes" baseline |

## Non-goals

Deliberately excluded — do not build them: multi-turn dialogue, higher input resolution, anyres /
multi-crop, fine-tuning the vision tower, the VQA multiple-choice benchmark, streaming output,
production model quantisation. See `Architecture.md` §1.2.

## Definition of done

| Criterion | Threshold |
|---|---|
| Full-val VQA accuracy (214,354 questions) | ≥ 68.0 % |
| Always-"yes" baseline measured and reported | yes |
| Model inference latency, p50 | ≤ 900 ms |
| `pytest` + `ruff check` + `ruff format --check` green | yes |
| Ablation table | all 7 rows |
| EvalAI `test-dev2015` score recorded | yes |
| `.git` under 50 MB | yes |

The final gate is `Task.md` § T10.3.
