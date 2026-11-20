# AskSight Model (Track B)

Model quality work is tracked in [MODEL_QUALITY_TASK.md](./MODEL_QUALITY_TASK.md).

LLaVA-style visual question answering: a frozen CLIP vision encoder, a small
trainable projection connector, and a frozen instruction-tuned language model.
The connector is always trained; optional LoRA adapters on the LM let it learn
a new answer style without updating the full model. A connector-only checkpoint
is ~14 MB plus its config; LoRA adds a small adapter.

```
image -> CLIP (frozen) -> connector (trained) -> spliced into LM embeddings -> Qwen2.5 (frozen + optional LoRA) -> answer
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
  startup, warms up, and reports readiness/latency/memory through `stats()`.
  Target serving hardware is still to be confirmed; `v0.1-colab` measured
  0.224 s median / 0.284 s p95 VQA latency on a Tesla T4 (263 held-out
  questions), which is a development reference, not a deployment guarantee.

## Setup

```bash
cd model
uv venv --python 3.12 .venv            # or: python3.12 -m venv .venv
# CPU-only machine:
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
# GPU machine: install the CUDA build instead (see pytorch.org), then:
.venv/bin/pip install -e ".[dev]"
# Optional LoRA training/serving:
.venv/bin/pip install -e ".[dev,lora]"
```

## Commands (run from `model/`)

```bash
# 1. Data: official VQA v2 questions/annotations + only the needed COCO images.
#    Produces train.jsonl / val.jsonl / test.jsonl with image-disjoint splits and
#    complete-sentence targets; keep short_answer for scoring/review.
python -m asksight_model.data --out data/vqa --train 20000 --val 1000 --test 1000 \
  --answer-style sentence
# Baseline reproduction (v0.3-style short targets):
python -m asksight_model.data --out data/vqa-short --train 20000 --val 1000 --test 1000 \
  --answer-style short

# 2. Train the connector (2 epochs, batch 4, bf16 + gradient checkpointing by default).
python -m asksight_model.train --config configs/default.yaml
# Connector + LoRA (install the optional extra first: pip install -e ".[lora]"):
python -m asksight_model.train --config configs/default.yaml --lora-rank 16 --version v0.4-lora

# 3. Evaluate on the held-out test split (VQA accuracy + latency).
python -m asksight_model.evaluate --checkpoint checkpoints/v0.1 --split test

# 3b. Same split under capture faults (blur/dark/obstructed/low-res).
python -m asksight_model.robustness --checkpoint checkpoints/v0.1 --split test

# 3c. Verify checkpoint artifacts against manifest.json (use --strict for release).
python -m asksight_model.verify --checkpoint checkpoints/v0.1 --strict

# 4. Serve (Track A imports this):
python -c "from asksight_model import LocalInferenceService; s = LocalInferenceService('checkpoints/v0.1')"
```

## Training runs

Two supported paths, same code: a CPU **smoke run** that verifies the pipeline, and
a GPU **full run** (Colab/Kaggle) that produces the demo-quality checkpoint.

### Smoke run — laptop CPU (pipeline check)

Same code path at small scale: dataset → training → checkpoint end to end. The
first run downloads the pinned backbones once (~4 GB) into the Hugging Face
cache; later runs start instantly.

```bash
python -m asksight_model.train \
  --config configs/default.yaml \
  --device cpu --limit 100 --version v0.1-smoke
```

Desired output (loss values are illustrative — they vary per run and hardware;
the *shape* is what matters):

```
epoch 0 step 0: loss 5.1...
epoch 0 step 10: loss 2.9...
{"epoch": 0, "train_loss": 2.2, "val_loss": 1.9, "seconds": 412.0}
{"epoch": 1, "train_loss": 1.5, "val_loss": 1.4, "seconds": 405.0}
checkpoint saved to checkpoints/v0.1-smoke
```

Success criteria:

- `train_loss` trends down across steps and `val_loss` follows it (if `val_loss`
  climbs while `train_loss` falls, note it in the PR — overfitting signal).
- `checkpoints/v0.1-smoke/` contains `projector.safetensors`, `config.yaml`,
  `manifest.json`, `metrics.json`, `data_meta.json`.
- Roughly 5–15 minutes of CPU time at `--limit 100`, backbone download excluded.

Verified on a CPU-only machine (11 Nov 2026): 421 s total (214.5 s + 206.5 s),
`train_loss` 3.06 → 1.96 and `val_loss` 2.89 → 1.63, all four checkpoint files
written, split fingerprints recorded.

This checkpoint exists to prove the machinery works. Its answers are weak — it
saw 100 questions; do not demo it.

### Full run — Google Colab T4 or Kaggle (recommended)

`model/notebooks/colab_train.ipynb` (committed to the repo so Colab can clone it):

1. Upload the notebook to Colab (File → Upload notebook) or Kaggle (File → Import notebook).
2. Defaults: `VERSION=v0.2-20k`, 20,000/1,000/1,000 questions, `DTYPE=float16`
   (common free T4s have no native bf16), `SEED=0`. Edit the notebook counts
   and version for 50,000/2,000/2,000.
3. Runtime depends on dataset size and assigned GPU. Allow roughly 4–7 hours
   for 20k including setup. The 50k estimate is about 8–16 hours by scaling
   from the 20k run, not a measured result. The final cell downloads the zip.

Desired output (abridged):

```
train: <actual count> questions, <image count> images
epoch 0 step 0: loss ...
{"epoch": 0, "train_loss": ..., "val_loss": ...}
checkpoint saved to checkpoints/v0.2-20k
{"split": "test", ..., "vqa_accuracy": 0.xx, "latency_median_s": ...}
v0.2-20k-ckpt.zip
```

The notebook clones `feat/multimodal-core-workflow` — `main` does not carry
`model/` yet, so a plain default-branch clone would fail at `%cd AskSight/model`.

Free notebook runtimes and GPU availability can vary, and the current trainer
saves its checkpoint at the end of a run only. Start with 20k; a 50k run may
not fit one free session. Save the downloaded checkpoint zip before closing
the session.

Success criteria: `vqa_accuracy` printed from the held-out test split (this is
the headline number), latency recorded, and a checkpoint folder matching the
contents listed in "Training and checkpoints (B4)" above. Colab runtimes are
ephemeral — the zip is the saved result.

### Kaggle run steps

1. Push the current notebook and model changes to `feat/multimodal-core-workflow`.
2. In Kaggle, create a Notebook, import `model/notebooks/colab_train.ipynb`,
   and set **Settings → Accelerator → GPU** and **Internet → On**.
3. Keep the default 20k counts for the first run. Select **Run all** and watch
   the output for the data, training, evaluation, and zip steps.
4. Download the zip from the notebook's **Output** panel before ending the
   session. The final cell copies it into `/kaggle/working` for this purpose.

Allow about 4–7 hours for 20k. A 50k run is roughly estimated at 8–16 hours,
depending on GPU and data downloads; Kaggle documents a maximum 12-hour notebook
session, so 50k may not fit one session. The trainer currently writes its
checkpoint only at the end; use 20k on free compute until save/resume support
is added. Kaggle's GPU availability and weekly quota can change; check its
[notebook documentation](https://www.kaggle.com/docs/notebooks) before a run.

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
  `answer` (the training target), `short_answer` (majority vote over the 10
  annotations, kept for scoring/review), `answer_style`, `answers` (all 10
  annotations — the evaluation references), `image_id`, `question_id`.
  `--answer-style sentence` restates common VQA question forms as complete
  sentences (`The cow is black and white.`); `short` reproduces the old
  fragment targets. The rewriter is rule-based, so spot-check samples before a
  training run.
- Licensing: VQA v2 annotations are CC BY 4.0; COCO images follow Flickr
  terms. Research/portfolio use only.

## Training and checkpoints (B4)

`configs/default.yaml` holds the model and training settings. Training freezes
both backbones, optimizes only the connector with AdamW + gradient clipping,
validates each epoch, and writes:

```
checkpoints/<version>/
├── projector.safetensors   # trained connector weights
├── adapter_config.json     # LoRA only
├── adapter_model.safetensors  # LoRA only
├── config.yaml             # backbones + revisions + prompt + LoRA + token limit
├── manifest.json           # sha256 + size of projector/config/adapter/data_meta
├── metrics.json            # losses, device, GPU, trainable params, configs
├── data_meta.json          # exact split provenance and answer style
└── predictions_<split>.jsonl  # written by evaluate
```

Reproducibility: fixed seed (`train.seed`), pinned backbone revisions, greedy
decoding, and the split fingerprints in `data_meta.json`. `metrics.json` also
records the git revision and dirty flag, Python/dependency versions, UTC
start/finish timestamps, hardware, and the copied dataset metadata. The
connector is trained in float32 even when the LM runs in bf16. `manifest.json`
hashes the immutable artifacts (`projector.safetensors`, `config.yaml`, and
`data_meta.json` when present); `metrics.json` is excluded because evaluation
appends to it.

Retrieve checkpoints from the approved artifact store rather than source
control (`checkpoints/` and `data/` are gitignored), then verify before serving:

```bash
sha256sum checkpoints/v0.1-colab/projector.safetensors   # against manifest.json
python -m asksight_model.verify --checkpoint checkpoints/v0.1-colab --strict
```

Checkpoints created before manifests existed can be migrated once on a trusted
local copy with `--write`, then verified strictly. `--write` records the current
bytes, so run it only before distribution, not after a download.

Before selecting a checkpoint for production, run `verify --strict`, confirm
`config.yaml` holds the exact prompt/LoRA/token settings used for training, and
confirm `metrics.json` has the held-out and AskSight evaluation results. Serving
loads those settings from the checkpoint; it does not substitute a newer prompt
or token limit.

## Evaluation (B6)

`python -m asksight_model.evaluate` reports the standard VQA accuracy (the
official answer normalization from the VQA v2 evaluation code is ported in
`evaluate.py`), a containment variant (`vqa_accuracy_contains`) that credits a
sentence containing the short reference, the share of complete multi-word
answers (`sentence_rate`), mean words, median/p95 inference latency, service
cold-start time, process memory, and writes predictions. Exact `vqa_accuracy`
collapses for sentence-trained checkpoints, so compare those candidates on
`vqa_accuracy_contains` and `sentence_rate`; keep exact accuracy for
short-answer baselines. Results are recorded in `metrics.json` per checkpoint
version. Latency is hardware-dependent — record it on the target deployment
hardware, not a development box or Colab runtime.

`python -m asksight_model.robustness` re-runs the same held-out split under one
realistic capture fault per condition — `clean`, `blur`, `dark`, `obstructed`,
`lowres` — and records per-condition accuracy and the drop against `clean` in
`metrics.json` under `eval_robustness`. That drop is the measured basis for the
"please verify this" guidance shown to a user; with the smoke checkpoint the
numbers are noise, and the 263-question `v0.1-colab` run is indicative but small
— set thresholds only from the release checkpoint run.

### Fixed AskSight question set

VQA v2 is a useful benchmark but does not represent every photo or question
AskSight users will ask. Keep a separate, version-controlled or otherwise
immutable JSONL set for representative app questions. Each line must include
an `id`, an `image` path relative to the JSONL file, a `question`, and a
`category` such as `object`, `color_count`, `scene`, or `reading_text`:

```json
{"id":"menu-01","image":"images/menu.jpg","question":"What does the soup cost?","category":"reading_text"}
```

Run it against a real checkpoint (the evaluator constructs
`LocalInferenceService`, so the development mock cannot be selected):

```bash
python -m asksight_model.evaluate --checkpoint checkpoints/v0.1-colab \
  --questions-file data/asksight/questions-v1.jsonl
```

The evaluator writes `predictions_asksight_<set-name>.jsonl` and an
`eval_asksight_<set-name>` entry to the checkpoint's `metrics.json`. The
metrics include the set's SHA-256, checkpoint/model version, saved system
prompt and token limit, sentence rate, latency/memory, and a heuristic
`fact_recall` for rows with `expected_facts`. Predictions preserve question
IDs, categories, image paths, references, and rubrics for manual review.
`fact_recall` only checks whether each rubric's content words appear in the
answer, so annotate a reviewed copy for correctness, image support,
brevity/usefulness, and error type (including missed text and invented
details), and report those judgments separately. Keep the exact set fixed when
comparing candidates; do not tune on it if it is being used as the final test
set.

`evaluations/asksight_v1.jsonl` is restored from the v0.3 saved predictions
(26 cases); its hash is in `evaluations/asksight_v1.sha256`, and the evaluator
also records the hash in every run.

## Prompt

The current default asks for clear, grounded English. Direct answers should be
one complete sentence, not a bare word; a request to describe a photo should
receive three to five short sentences. Serving uses the prompt and token limit
saved in the checkpoint's `config.yaml`, so training and serving cannot drift.
Older checkpoints keep their older prompt; retrain to adopt the current one.

`--answer-style sentence` (the default) rewrites common VQA targets into
complete sentences and keeps the original short answer in `short_answer`. LoRA
lets the LM learn that style; the connector-only recipe can still emit
fragments. The prompt comparison below tested older short-answer prompts on the
smoke checkpoint; it does not measure the current conversational prompt:

| prompt | VQA accuracy | answers with non-ASCII characters |
|---|---|---|
| one short sentence | 0.089 | 10/30 |
| **English, short phrase** | **0.200** | 5/30 |
| English, one short sentence | 0.122 | 7/30 |

v0.3 was trained on mostly short VQA answers, so a new prompt alone did not
teach it to produce complete sentences. New runs use sentence targets and
description examples; compare those outputs on a fixed, manually reviewed set.
A prompt still cannot fix visual accuracy. Re-run `experiment_prompts.py` to
measure prompt behavior against a release checkpoint before making accuracy
claims.

### Adding AskSight examples to training

The notebook builds description rows from COCO captions (`CAPTION_SENTENCES`
combines distinct captions per image). Add reviewed examples for text reading,
unanswerable photos, or real AskSight questions through `EXTRA_EXAMPLES_FILE`.
Put images under the notebook's `data/vqa/` directory and provide one JSONL row
per example with `question_id`, `image_id`, `image`, `question`, and `answer`.
Use unique string IDs and keep images separate from validation/test images.
Direct examples should be complete sentences; text-reading examples should
answer with the visible sign/label text; unanswerable examples should say the
photo does not show enough to answer. The merge cell adds these rows to
training only and records their file fingerprint in dataset metadata. Review
captions carefully because incorrect descriptions train the model to repeat
those errors.

## Inference service (B5)

All services satisfy the versioned in-process protocol
`{protocol_version, model_version: str, answer(image: PIL.Image, question: str) -> str}`:

- `MockInferenceService` — deterministic placeholder so Track A can build the
  full flow before training completes. Clearly marked, not a real model.
- `LocalInferenceService` — validates the checkpoint, loads the model once at
  construction (never per request), warms up with one tiny generation, and is
  ready only after that succeeds. Construction fails with a clear
  `FileNotFoundError`/`ValueError` for missing artifacts, manifest hash
  mismatches, unpinned remote backbones, out-of-range generation limits, or a
  projector/config shape mismatch — before any traffic is served. LoRA
  checkpoints load `adapter_model.safetensors` when `config.yaml` sets
  `lora_rank`; install `pip install -e ".[lora]"` on that host.

Request behavior:

- Inputs are validated first (non-empty question, ≤500 chars, readable image).
- Generation is greedy and bounded by `model.max_new_tokens` (validated to
  1–128); the service exposes no per-request token override.
- `max_concurrency` defaults to 1, preserving serialized generation on one
  GPU. Raise it only after measuring memory and throughput.
- `queue_timeout_s` (default 30 s) bounds the wait for a slot and raises
  `TimeoutError` without running the request. Generation already in progress is
  not interruptible mid-call; its work is bounded by the token limit. Empty or
  degenerate output returns `CLARIFY_ANSWER` ("ask again") rather than asserting
  a guess.
- Invalid input raises `ValueError`; inference failures propagate. Track A maps
  these to API errors. There is deliberately **no calibrated confidence score**
  until an evaluated method exists (Track A6).
- `stats()` returns request/failure/timeout counts, queue/generation/latency
  median and p95 over the last 1024 generation requests, cold-start seconds,
  RSS memory, model version, and readiness. Use it for health/readiness
  reporting and capacity measurements.

```python
service = LocalInferenceService(
    "checkpoints/v0.1-colab", device="auto", max_concurrency=1, queue_timeout_s=30
)
assert service.ready
print(service.stats())
```

### Serving boundary and deployment notes

The current boundary is in-process: the backend imports `LocalInferenceService`
when `ASKSIGHT_MODEL_CHECKPOINT` is set (see `backend/app/core/inference.py`).
That keeps the prototype simple but puts torch and model memory in the backend
process. A dedicated inference service or external host is still an open
product/deployment decision; the versioned protocol and `stats()` are designed
to move behind HTTP without changing Track A's contract.

Checklist for a serving host:

1. Install the CUDA build of PyTorch that matches the driver, then
   `pip install -e .` in a separate environment from the lightweight backend
   where possible.
2. Mount/copy the checkpoint outside source control and set
   `ASKSIGHT_MODEL_CHECKPOINT` to that directory. Backbones are cached under
   `HF_HOME`; set it to a persistent volume so cold starts do not re-download
   ~4 GB.
3. Verify with `python -m asksight_model.verify --checkpoint ... --strict`.
4. Start the backend/service and require `service.ready` before accepting
   traffic; log `service.stats()` at startup and periodically.
5. Smoke-test one `/ask` request and record cold start plus memory from the
   stats output.

## Ambiguity, quality, and operational notes

- The released v0.3 checkpoint was trained on short VQA answers and often
  replies with a fragment; it can also be plausibly wrong. New runs use
  sentence targets, but no retrained candidate has been evaluated yet. On the
  263-question `v0.1-colab` test split, robustness drops were 0.5–1.1 accuracy
  points for blur/dark/obstructed/low-res; the sample is small, so treat that
  as indicative and re-measure the final checkpoint.
- Answer-verification policy: return the clarification answer when the model
  output is empty; otherwise do not fabricate confidence. Tell users that
  answers from blurry, dark, obstructed, or very low-resolution captures may be
  wrong and should be verified, because no calibrated image- or answer-quality
  score has been evaluated yet. Revisit this policy with the final checkpoint's
  robustness numbers and the agreed product threshold.
- Language: VQA v2 is English-only, and so is the model's output. Multilingual
  support belongs to the Sarvam STT/TTS layer (Track A), which can translate
  around the English VQA core. Arbitrarily long or malformed questions are
  rejected by input validation; multilingual questions are accepted as text.
- Ambiguous questions yield a short guess, not a clarification, unless the
  output is empty. A clarification heuristic beyond the empty-output guard
  needs evaluation first.

## Troubleshooting

- **CUDA OOM while training:** lower `train.batch_size`, keep
  `gradient_checkpointing: true`, or use a larger GPU.
- **`no answer tokens found in suffix`:** the LM's chat template is not
  prefix-stable (generation prompt is not a prefix of the full rendering), so
  answer labels cannot be aligned. Check the checkpoint's tokenizer.
- **LoRA import or adapter error:** install `pip install -e ".[lora]"`; a
  checkpoint whose `config.yaml` sets `lora_rank` must contain both adapter
  files, and `verify --strict` fails if they are missing.
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
python -m asksight_model.verify --help
```

CI runs the same lint/format/test commands from `.github/workflows/ci.yml`;
tests use tiny local backbones and never download the production checkpoints.
Invalid checkpoints, manifest tampering, config/weight mismatches, generation
limits, queue timeouts, and degraded-image evaluation are covered.
