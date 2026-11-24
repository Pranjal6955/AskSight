# AskSight `model/` — Architecture & File Guide

## 1. How the model works

AskSight uses **Qwen3-VL-4B-Instruct**, a unified Vision-Language Model (VLM)
built by Alibaba. Unlike older LLaVA-style pipelines (a frozen vision encoder +
a separate connector MLP + a language model), Qwen3-VL was trained end-to-end
as one piece.

```
📷 Image ──→ [ Vision Transformer (ViT) ]
                        ↓  visual tokens
              [ Cross-attention / fusion ]
💬 Question ──→ [ Qwen3 Language Decoder ]  ──→  📝 Answer
```

The whole thing loads as one ~8 GB checkpoint from HuggingFace Hub.
No external API is called during inference — it runs 100 % locally.

### OCR and text reading

Qwen3-VL reads text in images natively — signs, labels, medicine bottles,
receipts, documents. This is built into the model from its original training.
Fine-tuning on TextVQA and DocVQA sharpens it further for the specific formats
blind and low-vision users encounter.

---

## 2. Fine-tuning strategy — QLoRA

Full fine-tuning of a 4B model costs tens of thousands of dollars.
QLoRA (Quantized Low-Rank Adaptation) brings that down to a free Kaggle GPU session.

```
Frozen: vision encoder (model.visual)   — never updated
Frozen: most language decoder weights   — never updated
Trained: LoRA adapters on attention     — q/k/v/o_proj, gate/up/down_proj
         (r=16, lora_alpha=32)          — ~10 M params out of 4 B (0.25 %)
```

The adapter checkpoint is ~50 MB. After training, set
`ASKSIGHT_MODEL_CHECKPOINT` to the adapter directory and the backend loads
the base model + adapter automatically.

### Datasets to fine-tune on

| Dataset | Why |
|---|---|
| **VizWiz-VQA** | Real photos by blind users — the closest match to actual usage |
| **TextVQA** | Images with text: signs, labels, menus, price tags |
| **DocVQA** | Documents, medicine bottles, receipts, forms |

Minimum viable run: ~5 000 VizWiz samples, 3 epochs, Kaggle T4 GPU (~2 hrs).

---

## 3. File reference

| File | Purpose |
|---|---|
| `qwen3_vl_engine.py` | Core model engine — loads Qwen3-VL, runs `predict()` |
| `service.py` | Thread-safe wrapper — semaphore, metrics, `answer()` → backend |
| `accessibility.py` | System prompts, dual-mode routing (describe vs question), TTS cleaning |
| `vision_gate.py` | OpenCV quality gate — rejects dark/blurry images before inference |
| `train_qlora.py` | QLoRA fine-tuning script — run on Kaggle/Colab GPU |
| `__init__.py` | Package public exports |

### Tests

| File | What it covers |
|---|---|
| `tests/test_qwen3_vl.py` | Engine, service, concurrency, quality gate — all with dummy models (no GPU needed) |

---

## 4. Quick-start commands

```bash
# Fine-tune on Kaggle (GPU required):
python -m asksight_model.train_qlora \
  --vizwiz_path  /kaggle/input/vizwiz/train.jsonl \
  --textvqa_path /kaggle/input/textvqa/train.jsonl \
  --docvqa_path  /kaggle/input/docvqa/train.jsonl \
  --epochs 3 \
  --output_dir ./checkpoints/asksight-v1

# Point the backend at your fine-tuned checkpoint:
# In backend/.env:
# ASKSIGHT_MODEL_CHECKPOINT="./checkpoints/asksight-v1"

# Run tests (CPU, no GPU needed):
pytest tests/
```
