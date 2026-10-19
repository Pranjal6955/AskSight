# AskSight

An accessibility assistant that lets visually impaired users point a camera at anything, ask a question by voice, and hear a spoken answer describing what's in front of them.

Built on a LLaVA-style multimodal architecture (CLIP vision encoder + projection layer + LLM), trained and evaluated on the VQA v2 dataset.

## What It Does

Point your camera at a menu, a label, a sign, or anything else — ask a question out loud like *"What does this say?"* or *"Is the light on?"* — and AskSight looks, understands, and speaks back an answer.

## Features

- 📷 Image capture via camera or upload
- 🎙️ Voice input (speech-to-text) with text input as backup
- 🧠 Multimodal Q&A pipeline (CLIP + projection layer + LLaVA-style LLM)
- 🔊 Spoken answers (text-to-speech), with on-screen text for screen readers
- ❓ Clarification fallback when the model is unsure, instead of guessing
- 🕘 Session history of past questions and answers

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS + Axios |
| Voice I/O | Web Speech API (SpeechRecognition + SpeechSynthesis) |
| Backend | FastAPI (Python) |
| AI/ML | PyTorch + Hugging Face Transformers + CLIP + bitsandbytes |
| Database | PostgreSQL |

## Training

The model lives in `model/` and is trained in two ways — same code, different scale:

- **Smoke run (any laptop, CPU, ~10 min)** — verifies dataset → training → checkpoint end to end:
  `python -m asksight_model.train --config configs/default.yaml --device cpu --limit 100 --version v0.1-smoke`
- **Full run (free Colab T4, ~40 min)** — the demo-quality checkpoint via `model/notebooks/colab_train.ipynb` (upload to Colab, Run all, checkpoint zip downloads at the end)

Expected outputs for both, plus serving instructions, are documented in [`model/README.md`](model/README.md#training-runs). Point the backend at a checkpoint with `ASKSIGHT_MODEL_CHECKPOINT=<dir>`.

## How It Works

1. User captures/uploads an image and asks a question by voice.
2. Browser speech-to-text transcribes the question.
3. Frontend sends the image + question to the FastAPI `/ask` endpoint.
4. CLIP encodes the image → projection layer maps it into the LLM's embedding space → LLM generates a natural-language answer.
5. The answer is logged, returned as JSON, and spoken back to the user via text-to-speech.

## Project Structure

```
accessibility-visual-assistant/
├── backend/        # FastAPI app, ML services, tests
├── frontend/       # React app (camera, voice, playback UI)
├── ml/             # Training notebooks and scripts
└── docker-compose.yml
```

## Status

Student/portfolio project — MVP scope covers single-turn image + question → spoken answer, with multi-turn follow-up as a stretch goal.

## Evaluation

- **Accuracy:** Standard VQA accuracy metric on held-out VQA v2 test data
- **Usability:** Qualitative sessions with visually impaired sample users
- **Latency:** Target < 3s model inference, < 5s full voice round-trip
