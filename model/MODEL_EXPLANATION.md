# AskSight `model/` Folder Codebase & Architecture Guide

Welcome to the AskSight model package documentation! This document provides an easy-to-understand, complete explanation of the architecture, every file, class, and function in the `model/` folder.

---

## 1. High-Level Architecture Overview

**AskSight** is an accessible AI assistant designed to help blind and visually impaired users understand photos and visual scenes.

Instead of training a giant model from scratch (which costs hundreds of thousands of dollars and huge compute), AskSight uses a **LLaVA-style (Large Language and Vision Assistant)** architecture:

```
[ User Image ] ──> [ Frozen CLIP Vision Encoder ] ──> Image Features (768-d)
                                                               │
                                                               ▼
                                               [ Trainable Connector (MLP) ] (768-d -> 1536-d)
                                                               │
                                                               ▼
[ User Question ] ──> [ Tokenizer & Splicing ] ────────> Combined Embeddings
                                                               │
                                                               ▼
                                                  [ Frozen Qwen2.5-1.5B LM ] (with optional LoRA)
                                                               │
                                                               ▼
                                                      [ Natural Answer ]
```

### Key Components:
1. **Vision Encoder (Frozen)**: `openai/clip-vit-base-patch32` — processes the image and extracts 50 visual tokens (49 spatial patches + 1 CLS token).
2. **Connector / Projector (Trained)**: A lightweight 2-layer Multilayer Perceptron (MLP) with GELU activation that translates image features into the language model's embedding space. The checkpoint is only **~14 MB**!
3. **Language Model (Frozen + optional LoRA)**: `Qwen/Qwen2.5-1.5B-Instruct` — generates complete, helpful English answers based on the spliced image features and user question.

---

## 2. Directory Structure of `model/`

```
model/
├── README.md                   # Core documentation and instructions for training/serving
├── MODEL_QUALITY_TASK.md       # Development progress, benchmarks, and quality tracking
├── pyproject.toml              # Python project metadata and package dependencies
├── experiment_prompts.py       # Script comparing different system prompts
├── configs/
│   └── default.yaml            # Default training & model hyperparameters
├── asksight_model/             # Main Python package
│   ├── __init__.py             # Package public exports
│   ├── config.py               # Configuration dataclasses and validations
│   ├── targets.py              # Rule-based VQA short-answer to full-sentence converter
│   ├── pipeline.py             # PyTorch model definition, splicing, saving, loading
│   ├── data.py                 # VQA v2 dataset downloader, splitter, and packager
│   ├── coco_captions.py        # COCO Captions downloader and description dataset builder
│   ├── train.py                # Connector and LoRA training script
│   ├── service.py              # Real-time inference services (Mock & Local)
│   ├── evaluate.py             # Evaluation script for VQA accuracy and latency
│   ├── evaluate_vlm.py         # Baseline comparison against native VLMs (e.g. Qwen3-VL)
│   ├── robustness.py           # Evaluates model performance on degraded/faulty images
│   └── verify.py               # Checkpoint integrity and sha256 manifest verification
├── evaluations/                # Curated evaluation datasets and reviews
│   ├── asksight_v1.jsonl       # Hand-curated test dataset
│   └── runs/                   # Evaluation results & markdown comparison reviews
├── notebooks/
│   └── colab_train.ipynb       # Google Colab notebook for GPU training
└── tests/                      # Pytest suite with zero-GPU fixtures
    ├── conftest.py             # Shared fixtures (tiny dummy vision & language models)
    ├── test_config.py
    ├── test_data.py
    ├── test_targets.py
    ├── test_coco_captions.py
    ├── test_pipeline.py
    ├── test_train.py
    ├── test_service.py
    ├── test_evaluate.py
    └── test_robustness.py
```

---

## 3. Detailed File-by-File & Function-by-Function Explanation

---

### `asksight_model/__init__.py`
* **Why we use it**: Exposes clean, high-level public APIs of the package so callers can simply write `from asksight_model import LocalInferenceService, AskSightModel`.
* **What it contains**:
  - Re-exports key classes: `AskSightModel`, `LocalInferenceService`, `MockInferenceService`, `InferenceService`, `ModelConfig`, `TrainConfig`.
  - Re-exports utility functions: `load_configs`, `load_projector`, `save_checkpoint`, `verify_checkpoint`.
  - Exports constants: `CLARIFY_ANSWER`, `PROTOCOL_VERSION`.

---

### `asksight_model/config.py`
* **Why we use it**: Manages all configuration settings (backbones, pinned git commits, model dimensions, prompt templates, training hyperparameters) using Python dataclasses. This ensures reproducibility and prevents broken settings.

#### Constants:
* `VISION_MODEL` & `VISION_REVISION`: `openai/clip-vit-base-patch32` pinned by exact commit hash.
* `LM_MODEL` & `LM_REVISION`: `Qwen/Qwen2.5-1.5B-Instruct` pinned by exact commit hash.
* `DEFAULT_SYSTEM_PROMPT`: The carefully engineered prompt instructing the model to be clear, factual, avoid assumptions, describe visible details, and say when something is unclear.
* `MAX_NEW_TOKENS_LIMIT`: Safety cap (128 tokens) preventing run-away generation loops.
* `DEFAULT_LORA_TARGETS`: Attention and MLP layers in Qwen2.5 targeted when LoRA is enabled.

#### Classes & Functions:
* **`ModelConfig` (dataclass)**:
  - Holds backbone IDs, revisions, connector hidden size, system prompt, max output tokens, and LoRA parameters.
  - `from_dict(data: dict)`: Creates a config from a dictionary, safely ignoring extra keys.
  - `to_dict()`: Converts configuration to a standard Python dictionary.
  - `save(path: Path)`: Serializes configuration to a YAML file.
  - `load(path: Path)`: Reads configuration from a YAML file.
* **`TrainConfig` (dataclass)**:
  - Holds training settings: dataset directory, output directory, number of epochs, learning rate, batch size, random seed, device, dtype, and gradient checkpointing.
  - `from_dict(data: dict)`: Constructs `TrainConfig` from a dictionary.
* **`load_configs(path: Path)`**:
  - Reads a single YAML file containing both `model:` and `train:` sections and returns `(ModelConfig, TrainConfig)`.
* **`validate_model_config(config: ModelConfig)`**:
  - Sanity check that prevents bad configurations. Validates that version strings are non-empty, token counts are valid, revisions are pinned for remote models, and LoRA parameters are valid numbers.

---

### `asksight_model/targets.py`
* **Why we use it**: Standard VQA v2 datasets contain answers that are just 1–2 words (e.g., Question: *"What color is the car?"*, Answer: *"blue"*). If trained directly on these, the model learns to answer in abrupt fragments. For visually impaired users, complete natural sentences (e.g., *"The car is blue."*) are much more pleasant and informative. This file uses rules and regex patterns to convert short VQA answers into full, natural sentences without needing an expensive LLM.

#### Functions:
* **`_looks_plural(text: str)`**: Checks if a noun ends with 's' or begins with a number greater than 1.
* **`_with_indefinite_article(answer: str)`**: Intelligently adds "a" or "an" before singular nouns (e.g., turns `"apple"` into `"an apple"` while leaving colors like `"red"` or plurals unchanged).
* **`_action_phrase(answer: str)`**: Formats verbs and actions (e.g., turns `"eating banana"` into `"eating a banana"`).
* **`_subject_predicate(subject: str, verb: str, answer: str)`**: Builds a grammatically correct sentence like `"The dog is brown."` or `"The shoes are black."`.
* **`_yes_no(answer: str)`**: Converts single-word affirmations/negations into `"Yes, that is correct."` or `"No, that is not correct."`.
* **`_count(question: str, answer: str)`**: Formats counting questions (e.g., *"How many cars?"* -> *"The number of cars is 3."*).
* **`to_sentence(question: str, answer: str)`**: The main entry point. Matches question patterns (colors, counts, yes/no, actions, locations, object identities) and returns an appropriate complete sentence. Falls back to `"The image shows [answer]."` if no specific template matches.

---

### `asksight_model/pipeline.py`
* **Why we use it**: The core neural network engine of AskSight. It combines the frozen CLIP vision encoder, the trainable MLP connector, and the language model. It handles embedding splicing, forward pass, answer generation, checkpoint hashing, and safe file loading.

#### Classes & Methods:
* **`Connector(nn.Module)`**:
  - A 2-layer Multilayer Perceptron (`Linear -> GELU -> Linear`) mapping CLIP's 768-dimensional visual vectors to the LM's 1536-dimensional token space.
  - `forward(features)`: Passes visual patch vectors through the MLP.
* **`AskSightModel(nn.Module)`**:
  - The complete multimodal pipeline.
  - `__init__(config, device, dtype)`: Loads CLIP Vision Model, CLIP Image Processor, LM Tokenizer, and Language Model (`Qwen2.5`). Freezes the vision and LM backbones so only the connector learns.
  - `enable_lora(adapter_dir=None)`: Attaches Low-Rank Adaptation (LoRA) weights to LM attention/MLP layers if fine-tuning LM weights as well.
  - `trainable_parameters()`: Returns parameters requiring gradients (connector + LoRA).
  - `train_mode()`: Sets the connector (and LoRA) to training mode while keeping the vision encoder in evaluation mode.
  - `enable_gradient_checkpointing()`: Saves GPU memory during training by recomputing intermediate activations during backward pass.
  - `_chat_texts(question, answer)`: Formats conversational messages with system prompt, user image sentinel `<|asksight_image|>`, and optional assistant answer using the tokenizer's chat template.
  - `_tokenize(text)`: Converts text to token IDs and offset mappings.
  - `_encode_sample(question, answer)`: Splits prompt around the image sentinel and assigns training labels (-100 mask on question tokens, real token IDs on answer tokens).
  - `_image_embeds(images)`: Runs images through the frozen CLIP model and the connector to produce visual token vectors.
  - `prepare_batch(images, questions, answers)`: Slices text tokens into prefix and suffix, inserts projected image embeddings in between, and pads to equal length.
  - `forward(images, questions, answers)`: Computes cross-entropy training loss.
  - `generate(images, questions, max_new_tokens)`: Runs greedy autoregressive text generation to produce an answer string for given images and questions.

#### Checkpoint & Safety Utilities:
* **`resolve_device(device)`**: Auto-detects CUDA GPU or CPU.
* **`resolve_dtype(dtype, device)`**: Selects `bfloat16`, `float16`, or `float32`.
* **`_sha256_file(path)`**: Calculates SHA-256 cryptographic hash of a file.
* **`write_manifest(path)`**: Writes a `manifest.json` file storing hashes and byte sizes of all checkpoint artifacts (`projector.safetensors`, `config.yaml`, LoRA adapters, `data_meta.json`).
* **`verify_checkpoint(path, require_manifest)`**: Verifies that checkpoint files exist and match their exact SHA-256 hashes to guard against corruption or tampering.
* **`save_checkpoint(path, model)`**: Saves connector weights as `projector.safetensors`, optional LoRA adapters, and the YAML config.
* **`load_projector(path, model)`**: Safely loads trained weights from `projector.safetensors` into the model's connector.

---

### `asksight_model/data.py`
* **Why we use it**: Automates preparing the training, validation, and test datasets. It downloads annotations from the official VQA v2 dataset, selects the required questions, downloads only the specific COCO images needed, and ensures **zero image overlap** between splits.

#### Key Functions:
* **`_download(url, dest)`**: Downloads files with an atomic `.part` rename so partial downloads never corrupt the cache.
* **`download_annotations(cache_dir)`**: Downloads and unzips official VQA v2 train and validation annotation zips.
* **`load_records(questions_path, annotations_path)`**: Merges questions with their crowdsourced answer lists into single records.
* **`group_by_image(records)`**: Groups all questions belonging to the same image.
* **`select_by_image(records, target, rng, image_ids)`**: Selects questions image-by-image to ensure whole images are kept together.
* **`split_by_image(records, ratio, rng)`**: Splits a list of records into two image-disjoint groups.
* **`download_images(records, coco_split, images_dir, jobs)`**: Downloads the needed COCO images in parallel using `ThreadPoolExecutor`.
* **`_write_split(path, records, images_subdir, answer_style)`**: Writes records to `.jsonl` files, converting answers to full sentences using `to_sentence()` when requested.
* **`_assert_disjoint(splits)`**: Enforces that no image appears in more than one split (prevents data leakage).
* **`prepare(...)`**: Main workflow coordinator orchestrating download, splitting, image fetching, and writing dataset metadata (`meta.json`).
* **`main()`**: CLI entry point supporting arguments like `--train`, `--val`, `--test`, and `--answer-style`.

---

### `asksight_model/coco_captions.py`
* **Why we use it**: VQA models often struggle when users simply say *"Describe this photo"*, because VQA data consists of specific questions (*"What color...?"*). This script downloads COCO Captions (train2014) and converts human image descriptions into training examples where question = `"Describe this photo."` and answer = full descriptive caption.

#### Key Functions:
* **`_load_captions(data_dir, captions_json)`**: Downloads COCO Captions zip (~241 MB), verifies SHA-256 hash, and extracts caption annotations.
* **`_caption_tokens(caption)`**: Extracts clean lowercase word tokens for similarity checks.
* **`_distinct_captions(captions, limit)`**: Filters out redundant captions using Jaccard token overlap so sentences don't repeat the exact same information.
* **`_description_rows(image_id, captions, limit, image_path)`**: Builds JSONL dictionary rows for image descriptions.
* **`prepare(...)`**: Selects candidate images, verifies that none overlap with VQA validation or test splits, downloads the images, and writes output `.jsonl` files.
* **`main()`**: Command-line interface for the caption pipeline.

---

### `asksight_model/train.py`
* **Why we use it**: The training engine. It trains the projection connector (and optional LoRA adapters) using PyTorch, AdamW optimizer, and cross-entropy loss, while keeping the heavy vision and language backbones frozen.

#### Key Functions:
* **`load_jsonl(path)`**: Utility to read lines of a `.jsonl` file into a list of dictionaries.
* **`_code_revision()`**: Records current git commit hash and dirty status so training runs have complete provenance.
* **`_dependency_versions()`**: Captures exact versions of Python, PyTorch, Transformers, Pillow, and Safetensors.
* **`_load_batch(records, data_dir)`**: Loads PIL images, questions, and target answers for one training batch.
* **`_batches(records, batch_size, rng)`**: Shuffles and yields batches.
* **`_val_loss(model, records, data_dir, batch_size)`**: Computes validation loss over held-out records without computing gradients.
* **`train(model_config, train_config)`**:
  - Initializes model, AdamW optimizer, and gradient clipping.
  - Runs epochs, logging training and validation loss per epoch.
  - Saves final weights to `checkpoints/<version>/projector.safetensors`.
  - Saves configuration, dataset metadata, and training metrics (`metrics.json`).
  - Writes a cryptographic `manifest.json`.
* **`main()`**: Command-line interface parsing arguments like `--config`, `--limit`, `--device`, and `--lora-rank`.

---

### `asksight_model/service.py`
* **Why we use it**: Implements the serving layer used by the AskSight backend (Track A). It loads a checkpoint once into memory, handles concurrent request queues, performs warmup, and responds to real user queries.

#### Key Classes & Functions:
* **`InferenceService (Protocol)`**:
  - Python typing protocol defining what an inference service must provide: `model_version`, `protocol_version`, and `answer(image, question)`.
* **`validate_inputs(image, question)`**:
  - Reusable input validation: checks that image is a valid PIL Image, converts it to RGB, checks that question is non-empty, and enforces a 500-character limit.
* **`MockInferenceService`**:
  - A fast, deterministic fake service returning `"[mock answer] <question>"` without loading heavy weights. Used for local unit tests and UI development when a GPU is unavailable.
* **`LocalInferenceService`**:
  - Production service loading actual PyTorch model weights.
  - `__init__(checkpoint_dir, device, dtype, max_concurrency, queue_timeout_s)`: Loads config, verifies manifest, loads connector weights, and triggers warmup.
  - `warmup()`: Executes one tiny dummy inference at startup so the first real user query is fast (avoids cold-start latency).
  - `answer(image, question)`: Thread-safe method guarded by a concurrency semaphore. Generates the response. If the model outputs nothing, returns `CLARIFY_ANSWER` (*"Sorry, I could not find a clear answer. Could you ask again in different words?"*).
  - `stats()`: Returns operational telemetry: uptime, RSS memory usage (MB), total requests, failure counts, and latency percentiles (median and p95).

---

### `asksight_model/evaluate.py`
* **Why we use it**: Evaluates trained models on held-out test splits. It computes official VQA accuracy, sentence completion rate, answer length, and latency percentiles.

#### Key Functions:
* **`normalize_answer(text)`**: Ported from official VQA v2 evaluation code; strips punctuation, standardizes contractions (*"don't"*, *"can't"*), converts word numbers (*"one"*, *"two"*) to digits, and removes articles (*"a"*, *"an"*, *"the"*).
* **`vqa_accuracy(predictions, references)`**: Official VQA accuracy metric: $\min(\text{matches}/3, 1.0)$ averaged across all questions.
* **`answer_contains(prediction, reference)`**: Subsequence match checker.
* **`vqa_accuracy_contains(predictions, references)`**: Modified metric for sentence-style answers: checks whether the short expected answer is contained inside the generated full sentence.
* **`is_complete_sentence(text)`**: Checks if the answer contains at least 2 words and ends with terminal punctuation (`.`, `!`, `?`).
* **`sentence_rate(predictions)`**: Percentage of predictions that are complete sentences.
* **`fact_coverage(prediction, facts)` & `fact_metrics(...)`**: Measures whether key expected factual keywords appear in model descriptions.
* **`evaluate(checkpoint_dir, data_dir, split, limit, device)`**: Evaluates checkpoint against VQA test split, writes `predictions_<split>.jsonl`, and updates `metrics.json`.
* **`evaluate_questions(checkpoint_dir, questions_file, limit, device)`**: Runs evaluation on a fixed hand-curated question set (`evaluations/asksight_v1.jsonl`).
* **`main()`**: CLI tool to run evaluations.

---

### `asksight_model/evaluate_vlm.py`
* **Why we use it**: Evaluates off-the-shelf multimodal foundation models (e.g., `Qwen/Qwen3-VL-2B-Instruct`) on the exact same benchmark (`evaluations/asksight_v1.jsonl`).
* **What it does**: Provides a direct quality baseline to compare AskSight's lightweight model against larger state-of-the-art vision-language models.

---

### `asksight_model/robustness.py`
* **Why we use it**: Visually impaired users often take photos that are blurry, poorly lit, obstructed by fingers, or low resolution. This script measures how model accuracy degrades under realistic camera capture faults so the app knows when to advise the user to retake the photo.

#### Key Functions:
* **`degrade(image, condition)`**: Applies realistic image corruptions:
  - `"blur"`: Gaussian blur (radius = 4).
  - `"dark"`: Brightness decreased by 65%.
  - `"obstructed"`: Black box placed over center 50% of the image (simulating finger on the lens).
  - `"lowres"`: Downsampled 8x then bilinearly upsampled.
* **`run(...)`**: Runs inference across clean and degraded versions, calculating the exact accuracy drop vs. clean images.
* **`main()`**: CLI command for robustness evaluation.

---

### `asksight_model/verify.py`
* **Why we use it**: A standalone verification CLI tool. It verifies that a checkpoint directory is intact, contains all required files, and matches its SHA-256 manifest. Can also generate a new manifest for trusted checkpoints with `--write`.

---

### `experiment_prompts.py`
* **Why we use it**: An experimental scratch script used during development to compare different system prompts (e.g. testing whether Qwen2.5 outputs English or Chinese, and comparing short single-word answers vs. complete sentences).

---

## 4. Test Suite (`tests/`)

AskSight has a comprehensive unit test suite designed to run quickly on CPU without requiring GPU hardware or downloading multi-gigabyte models.

* **`conftest.py`**: Builds small, lightweight dummy models in memory (a tiny 2-layer ViT and a tiny GPT-2 model) so pipeline tests can run in seconds.
* **`test_config.py`**: Tests configuration loading, YAML saving, and validation rules.
* **`test_targets.py`**: Tests rule-based sentence conversion across various question patterns.
* **`test_data.py`**: Tests data loading, image-disjoint partitioning, and no-leakage guarantees.
* **`test_coco_captions.py`**: Tests caption extraction and deduplication logic.
* **`test_pipeline.py`**: Tests tensor dimension matching, batch splicing, forward pass, generation, and manifest verification.
* **`test_train.py`**: Tests training loops and gradient updates on dummy models.
* **`test_service.py`**: Tests `MockInferenceService` and `LocalInferenceService`, concurrency controls, timeouts, and stats telemetry.
* **`test_evaluate.py`**: Tests VQA accuracy calculations and answer normalization.
* **`test_robustness.py`**: Tests image degradation filters and robustness scoring.

---

## 5. Summary Cheat Sheet: When to Run What

| What you want to do | Command to run |
|---|---|
| **Prepare VQA dataset** | `python -m asksight_model.data --out data/vqa --train 20000 --val 1000 --test 1000` |
| **Prepare Caption dataset** | `python -m asksight_model.coco_captions --data-dir data/vqa --num-images 2000` |
| **Train Connector** | `python -m asksight_model.train --config configs/default.yaml` |
| **Train with LoRA** | `python -m asksight_model.train --config configs/default.yaml --lora-rank 16 --version v0.4-lora` |
| **Run Tests** | `pytest tests/` |
| **Evaluate Checkpoint** | `python -m asksight_model.evaluate --checkpoint checkpoints/v0.3-vqa20k-cap10k` |
| **Check Capture Faults** | `python -m asksight_model.robustness --checkpoint checkpoints/v0.3-vqa20k-cap10k` |
| **Verify Integrity** | `python -m asksight_model.verify --checkpoint checkpoints/v0.3-vqa20k-cap10k --strict` |
| **Use in Python code** | `from asksight_model import LocalInferenceService; s = LocalInferenceService("checkpoints/v0.3-vqa20k-cap10k")` |
