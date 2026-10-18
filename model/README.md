# AskSight Model (Track B)

LLaVA-style visual question answering: a frozen CLIP vision encoder, a small
trainable projection connector, and a frozen instruction-tuned language model.
Only the connector is trained; a checkpoint is a few MB plus its config.

```
image -> CLIP (frozen) -> connector (trained) -> spliced into LM embeddings -> Qwen2.5 (frozen) -> answer
```

## Backbone selection (B1)

| Role | Checkpoint | Dims | License | Pinned revision |
|---|---|---|---|---|
| Vision encoder (frozen) | [`openai/clip-vit-base-patch32`](https://huggingface.co/openai/clip-vit-base-patch32) | ViT-B/32, 224px, 50 visual tokens (49 patches + CLS), hidden 768 | MIT | `3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268` |
| Projection connector (trained) | 2-layer MLP, 768 → LM hidden | GELU, LLaVA-style | in-repo | — |
| Language model (frozen) | [`Qwen/Qwen2.5-1.5B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) | 1.5B params, hidden 1536 | Apache-2.0 | `989aa7980e4cf806f80c7fef2b1adb7bc71aa306` |

Rationale: ViT-B/32 keeps visual tokens at 50 (vs 576 for ViT-L/14-336), which
keeps latency and memory low enough to serve on modest hardware; Qwen2.5-1.5B
is a strong small instruction model with a permissive license. Both are
swappable via `configs/default.yaml`; the connector adapts to any
CLIP-encoder + decoder-only-LM pair.

## Hardware

- **Training (recommended):** a remote GPU with ≥16 GB VRAM (T4/L4/A10 class)
  at batch size 4 with bf16 and gradient checkpointing. The pinned backbones
  must be downloaded once (~4 GB). This repository's development machine has
  no GPU; training has not been run on it — all local tests use tiny fixture
  models and never download checkpoints.
- **Inference:** CPU works (slow; measured latency is recorded per checkpoint
  by `evaluate`), GPU strongly recommended. The service loads weights once at
  startup.

## Setup

```bash
cd model
uv venv --python 3.12 .venv            # or: python3.12 -m venv .venv
# CPU-only machine:
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
# GPU machine: install the CUDA build instead (see pytorch.org), then:
.venv/bin/pip install -e ".[dev]"
```

## Commands (run from `model/`)

```bash
# 1. Data: official VQA v2 questions/annotations + only the needed COCO images.
#    Produces train.jsonl / val.jsonl / test.jsonl with image-disjoint splits.
python -m asksight_model.data --out data/vqa --train 2000 --val 250 --test 250
python -m asksight_model.data --out data/vqa --train 20000 --val 1000 --test 1000   # fuller run

# 2. Train the connector (2 epochs, batch 4, bf16 + gradient checkpointing by default).
python -m asksight_model.train --config configs/default.yaml

# 3. Evaluate on the held-out test split (VQA accuracy + latency).
python -m asksight_model.evaluate --checkpoint checkpoints/v0.1 --split test

# 4. Serve (Track A imports this):
python -c "from asksight_model import LocalInferenceService; s = LocalInferenceService('checkpoints/v0.1')"
```

## Data pipeline (B3)

`python -m asksight_model.data` downloads the official VQA v2 question and
annotation zips from `visualqa.org`/S3 and **only** the COCO images selected for
the subset (per-image direct URLs, no 20 GB image-zip downloads).

- Training records come from the official train split (train2014 images).
- `val` and `test` come from the official validation split (val2014 images),
  split by image into two halves. Per split sizes are configurable.
- Splits are assigned per image and asserted to be image-disjoint with unique
  `(image, question)` pairs, so per-image and per-question leakage is
  impossible. `meta.json` records the seed, sources, counts, and a sha256
  fingerprint of each split's question ids. `train` copies this into the
  checkpoint as `data_meta.json`.
- Each JSONL record: `image` (path relative to the data dir), `question`,
  `answer` (majority vote — the training target), `answers` (all 10
  annotations — the evaluation references), `image_id`, `question_id`.
- Licensing: VQA v2 annotations are CC BY 4.0; COCO images follow Flickr
  terms. Research/portfolio use only.

## Training and checkpoints (B4)

`configs/default.yaml` holds the model and training settings. Training freezes
both backbones, optimizes only the connector with AdamW + gradient clipping,
validates each epoch, and writes:

```
checkpoints/<version>/
├── projector.safetensors   # the only trained weights
├── config.yaml             # backbone names + pinned revisions + prompt settings
├── metrics.json            # per-epoch losses, device, GPU model, configs
├── data_meta.json          # exact split provenance
└── predictions_<split>.jsonl  # written by evaluate
```

Reproducibility: fixed seed (`train.seed`), pinned backbone revisions, greedy
decoding, and the split fingerprints in `data_meta.json`. The connector is
trained in float32 even when the LM runs in bf16.

## Evaluation (B6)

`python -m asksight_model.evaluate` reports the standard VQA accuracy (the
official answer normalization from the VQA v2 evaluation code is ported in
`evaluate.py`), median/p95 inference latency, and writes predictions. Results
are recorded in `metrics.json` per checkpoint version. Latency is
hardware-dependent — record it on the target deployment hardware.

## Inference service (B5)

All services satisfy `{model_version: str, answer(image: PIL.Image, question: str) -> str}`:

- `MockInferenceService` — deterministic placeholder so Track A can build the
  full flow before training completes. Clearly marked, not a real model.
- `LocalInferenceService` — loads a checkpoint once at construction (never per
  request), runs greedy generation, serializes generation behind a lock, and
  validates inputs (non-empty question, ≤500 chars, readable image).
- Empty/degenerate model output returns `CLARIFY_ANSWER` ("ask again") rather
  than asserting a guess. There is deliberately **no calibrated confidence
  score** until an evaluated method exists (Track A6).

## Ambiguity, quality, and operational notes

- The model is trained on a VQA subset and answers in one short sentence
  (good for TTS). Answers can be plausibly wrong — blurry, dark, or obscured
  images should be flagged to the user as "verify this" (Track B6 follow-up;
  the current service cannot detect these cases).
- Language: VQA v2 is English-only. Multilingual support belongs to the
  Sarvam STT/TTS layer (Track A), which can translate around the English VQA core.
- Ambiguous questions yield a short guess, not a clarification, unless the
  output is empty. A clarification heuristic beyond the empty-output guard
  needs evaluation first.

## Troubleshooting

- **CUDA OOM while training:** lower `train.batch_size`, keep
  `gradient_checkpointing: true`, or use a larger GPU.
- **`no answer tokens found in suffix`:** the LM's chat template is not
  prefix-stable (generation prompt is not a prefix of the full rendering), so
  answer labels cannot be aligned. Check the checkpoint's tokenizer.
- **Slow first run:** backbones download from Hugging Face once (~4 GB); set
  `HF_HOME` to control the cache location.
- **`CLIPImageProcessor` fallback warning:** without `torchvision` installed,
  transformers falls back to a PIL preprocessing backend with identical
  output; install `torchvision` to silence it.

## Tests

```bash
cd model
.venv/bin/pytest -q          # tiny local fixtures: no network, no checkpoints
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```
