# AskSight — LLaVA-style Multimodal Architecture for VQA v2

**Status:** design approved, not yet implemented
**Scope:** everything from raw COCO/VQA v2 images to a `POST /ask` endpoint that returns a spoken answer
**Audience:** a human developer implementing this from scratch with no coding-assistant available

This document is the contract. Every shape, hyperparameter, file path, command and metric
definition a developer needs is specified here. Where a decision was available, one was made and
justified — do not substitute your own.

---

## Table of contents

1. [Goals, non-goals, success criteria](#1-goals-non-goals-success-criteria)
2. [System architecture](#2-system-architecture)
3. [Model specification](#3-model-specification)
4. [Prompt and sequence format](#4-prompt-and-sequence-format)
5. [Answer post-processing and the VQA accuracy metric](#5-answer-post-processing-and-the-vqa-accuracy-metric)
6. [Data pipeline](#6-data-pipeline)
7. [Reference implementation](#7-reference-implementation)
8. [Training](#8-training)
9. [Evaluation](#9-evaluation)
10. [Inference service and the `/ask` API](#10-inference-service-and-the-ask-api)
11. [Repository layout and dependency strategy](#11-repository-layout-and-dependency-strategy)
12. [Environment](#12-environment)
13. [Gotchas that will cost you days](#13-gotchas-that-will-cost-you-days)
14. [Risk register](#14-risk-register)
15. [References](#15-references)

---

## 1. Goals, non-goals, success criteria

### 1.1 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | A CLIP vision encoder + learnable projection + LLM multimodal model that answers VQA v2 questions about images | Val accuracy on `val` split |
| G2 | The model trains end-to-end on real VQA v2 data and its checkpoints are reproducible from a single command | Re-running the training command reproduces the reported number |
| G3 | Evaluation uses the **official** VQA accuracy metric, not exact-match | `accuracy` reported by `ml/evaluate.py` matches EvalAI within ±0.3 |
| G4 | The trained model is servable through `POST /ask` on the existing FastAPI backend | Round-trip latency and a working `/docs` entry |
| G5 | A clarification fallback triggers when the model is not confident | Calibrated threshold, measured precision/recall on val |
| G6 | The model runs at **< 3 s** model inference on the target device | `latency_ms` in the `/ask` response, p50 over 200 requests |

### 1.2 Non-goals

Do not build these. They are listed so you do not wander into them.

- Multi-turn / conversational follow-ups. README calls this a stretch goal; it is explicitly
  out of scope for this architecture.
- Image resolution above 336 px. No AnyRes / multi-crop (that is LLaVA-NeXT, a different model).
- Training the CLIP vision tower (freezing it is the decision — see §3.1).
- Multiple-choice VQA v2 benchmark (`vqa_v2_mc`). Open-ended only.
- Streaming/token-by-token output, quantization of the served model (4-bit QLoRA weights are fine),
  KV-cache reuse across questions for the same image.
- An iOS/Android app. The existing `ui/` Expo app consumes `/ask` but is not modified by this work
  beyond that.

### 1.3 Success criteria (the definition of "done")

All four must hold. These are the numbers you report.

| Criterion | Threshold | Why this number |
|---|---|---|
| `val` VQA accuracy (full 214,354 q), 7B model | **≥ 68.0 %** | Below this something is wrong; 1 epoch of QLoRA on VQA v2 should clear 70 % |
| `val` VQA accuracy, always-"yes" baseline | measured, reported | Must be beaten by > 35 points; expect ~25 % |
| Model inference latency, p50, 1×A100-40GB | **≤ 900 ms** | README targets < 3 s; design has ~10× headroom |
| `pytest` + `ruff check` + `ruff format --check` | green | Existing CI gate |

### 1.4 Target numbers for context (published, not measured by you)

| System | VQAv2 val accuracy (overall) |
|---|---|
| Always answer "yes" (trivial baseline) | ~25 % |
| CLIP ViT-L/14-336 zero-shot, cosine-match against answer vocabulary | ~60 % |
| BLIP-2 (FlanT5-XL) | ~79 % |
| LLaVA-1.5-7B | ~78 % |
| LLaVA-1.5-13B | ~79 % |

The point of listing these: a 68–72 % result from a frozen CLIP + 7B QLoRA at ~1/50th the
compute is a **credible, honest** outcome for a student project. Do not claim SOTA. Report what you
measure and compare against the baselines in the table.

---

## 2. System architecture

```
                    ┌───────────────────────── TRAINING (offline, ml/) ─────────────────────────┐
                    │                                                                        │
  COCO images ──┐   │  ┌──────────┐   576×1024   ┌──────────────┐   576×4096   ┌──────────┐  │
  (19 GB)       ├──►│  │  CLIP    │─────────────►│  Projector   │─────────────►│   LLM    │  │
                │   │  │ ViT-L/14 │  last_hidden │  MLP 2-layer │   visual     │ Vicuna   │──┼──► answer
  VQA v2 JSON ──┘   │  │   /336   │  _state      │  + GELU      │   tokens     │  7B      │  │
                    │  │ FROZEN   │  [B,577,1024]└──────────────┘              │ + QLoRA │  │
                    │  └──────────┘   drop CLS     trainable 21M                └──────────┘  │
                    │                                                                        │
                    └────────────────────────────────────────────────────────────────────────┘
                                                      │  checkpoint/  (adapter + projector + processor)
                                                      ▼
                    ┌───────────────────────── SERVING (online, backend/app/) ───────────────────┐
  POST /ask  ──────►│  decode image → CLIPProcessor → same frozen CLIP → same projector          │
  (multipart:       │  → splice visual tokens into the prompt → greedy decode ≤10 tokens          │
   image+question)  │  → post-process → VQA-score self-consistency → clarify? → JSON              │
                    └──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Data flow invariants

These hold for both training and serving, and they are the #1 source of train/serve skew bugs:

1. The **exact same** `CLIPProcessor` instance settings are used in both paths. At the end of every
   training run, call `processor.save_pretrained(run_dir)` so serving loads the artifact, not a
   re-resolution of the model name by name.
2. The **exact same** prompt template string. It lives in one constant, imported by both sides.
3. The **exact same** answer post-processor. It lives in `backend/app/ml/answer_postprocess.py`, is
   pure Python with zero imports beyond `re`, and is imported by `ml/evaluate.py` too. There is
   exactly one copy in the repository.

---

## 3. Model specification

### 3.1 Vision encoder — frozen

| Property | Value |
|---|---|
| HF id | `openai/clip-vit-large-patch14-336` |
| Use | `.vision_model` **only** (the text tower is discarded) |
| Image size | 336 × 336 |
| Patch size | 14 → 24 × 24 = 576 patches |
| Hidden size | 1024 |
| Layers / heads | 24 / 16 |
| Output we take | `last_hidden_state`, shape `[B, 577, 1024]` |
| Token we drop | index 0 (CLS) → `[B, 576, 1024]` |
| Trainable | **No.** `requires_grad_(False)`, `eval()` mode, no grad checkpointing on it |

Dropping CLS is the LLaVA-1.5 convention. LLaVA-1.0 kept the CLS token (577 image tokens);
LLaVA-1.5 drops it (576). We follow 1.5.

Preprocessing, from `CLIPImageProcessor` defaults — do not hand-roll these:

```
resize:      shortest edge → 336, bicubic
center crop: 336 × 336
rescale:     1/255
normalize:   mean = (0.48145466, 0.4578275,  0.40821073)
             std  = (0.26862954, 0.26130258, 0.27577711)
```

**Cheap alternative for smoke tests:** `openai/clip-vit-base-patch32` → 32×32 = 1024 patches,
hidden 768, 1025 tokens. Good for proving the pipeline end-to-end in minutes; bad for final
accuracy. Everything in this document works with either; the code derives the token count from
config (§7.4) so nothing is hardcoded to 576.

### 3.2 Projection layer — trainable

```
Linear(1024 → 4096) → GELU → Linear(4096 → 4096)
```

| Item | Value |
|---|---|
| Inputs | `[B, 576, 1024]` |
| Output | `[B, 576, 4096]` (LLM hidden size) |
| Parameters | 1024·4096 + 4096 + 4096·4096 + 4096 = **20,979,712** (21.0 M) |
| Init | `nn.Linear` defaults, i.e. Kaiming-uniform with `a = √5`. **Do not add custom init** |
| Trainable | **Yes**, always, from the first step |

`GELU` is `nn.GELU()` (exact erf form, not tanh approximation).

Optional variant `layer_norm=True` prepends `nn.LayerNorm(1024)`. Default is **off** to match
LLaVA-1.5's 2-layer `mlp2x_gelu` projector. Turning it on is ablation **A4** (§9.4).

This layer is the entire bridge between the two modalities. It is the only new architecture in the
system — everything else is off-the-shelf. Its output is inserted into the LLM's token embedding
stream at the position of the `<image>` token.

### 3.3 Language model — QLoRA

| Item | Choice |
|---|---|
| Target checkpoint | `lmsys/vicuna-7b-v1.5` |
| Architecture | LLaMA-1 derivative, `LlamaForCausalLM` |
| Hidden size | 4096 |
| Layers / heads / KV heads | 32 / 32 / 32 (no GQA) |
| FFN intermediate | 11008 |
| Vocabulary | 32000 |
| Max position embeddings | 2048 |
| Quantization | 4-bit NF4, double quant, bf16 compute dtype |
| Adapter | LoRA r=64, α=128, dropout 0.05, on `q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj` |
| Embedding + LM head | **frozen** |
| Gradient checkpointing | enabled on the LLM, `use_cache=False` |

Why Vicuna-7B-v1.5 and not Llama-3: Vicuna-7B-v1.5 is exactly the LLaVA-1.5 pairing, it has the
32000-token LLaMA-1 vocabulary, and `lmsys/vicuna-7b-v1.5` is a **gated** repo — you must accept
the licence on the HF website while logged in, then `huggingface-cli login`. If you cannot get
access, the drop-in substitute with an identical architecture is `TinyLlama/TinyLlama_v1.1`
(ungated, 22 layers, hidden 2048, vocab 32000) — then set `text_hidden_size: 2048` in the config
and the projector becomes 6.3 M params. Nothing else changes.

**New token.** Add `<image>` as a special token:

```
tokenizer.add_tokens(["<image>"], special_tokens=True)   # yields id 32000
model.resize_token_embeddings(len(tokenizer))           # 32000 -> 32001
```

The new row is randomly initialised. This is fine and requires no special handling: at forward time
that position is **always overwritten** by projected image features, so the random values are never
read by the loss. What matters is that you resize **after** adding the token, in both the model and
the tokenizer, or the ids will be out of range.

**Padding token.** Do **not** `add_special_tokens({"pad_token": "<pad>"})`. That would insert a
*second* randomly initialised row which is never trained, and unlike the `<image>` row it is not
always overwritten — its embedding is read during the forward pass, so it injects a small amount of
constant noise into every batch and, worse, into any logits comparison you make. Use the tokenizer's
existing token instead:

```
tokenizer.pad_token = tokenizer.unk_token      # LLaMA vocab id 0
model.config.pad_token_id = tokenizer.pad_token_id
```

Right-pad the batch and pass `attention_mask`. LLaMA's causal mask plus the padding mask handles
this correctly; you do not need explicit `position_ids`.

### 3.4 Full parameter budget (7B path)

| Group | Params | Trainable |
|---|---:|---:|
| CLIP ViT-L/14-336 vision tower | 304 M | 0 |
| Vicuna-7B (quantized base) | 6.7 B | 0 |
| LoRA adapters (r=64, 7 target modules, 32 layers) | 159.9 M | 159.9 M |
| Projector | 21.0 M | 21.0 M |
| `<image>` embedding row | 4096 | 0 (always overwritten) |
| **Total trainable** | | **≈ 181 M** (2.5 % of the model) |

### 3.5 Sequence-length budget

| Segment | Tokens |
|---|---:|
| `<s>` (BOS, added by tokenizer) | 1 |
| `USER: ` | 3 |
| 576 × `<image>` | 576 |
| `\n` | 1 |
| question (p99 of VQA v2 is 12 words) | ≤ 24 |
| ` ASSISTANT:` | 4 |
| **prompt subtotal** | **≤ 609** |
| answer (p99 is 4 words) | ≤ 12 |
| `</s>` | 1 |
| **total** | **≤ 622** |

Set `max_seq_len = 640`. Round up to a multiple of 8 (`640` already is) for tensor-core efficiency.
Dynamic per-batch padding: sort-free, just pad to the longest in the batch. Padding is masked in both
`attention_mask` and `labels`.

---

## 4. Prompt and sequence format

### 4.1 Templates

```python
SYSTEM_PROMPT = (
    "A chat between a curious human and an artificial intelligence assistant. "
    "The assistant gives helpful, detailed, and polite answers to the human's questions."
)

PROMPT_TEMPLATE = "USER: <image>\n{question} ASSISTANT:"
ANSWER_TEMPLATE = " {answer}</s>"
```

Assembled (training, full sequence):

```
<s>USER: <image>\n{question} ASSISTANT: {answer}</s>
```

and at serving time the generation prefix is just:

```
<s>USER: <image>\n{question} ASSISTANT:
```

The system prompt is included by default. To ablate it, set `use_system_prompt: false`; the prompt
then starts directly at `USER:`. Log which one you used — a prompt change without a re-eval
invalidates your accuracy number.

### 4.2 Label masking (loss on answer tokens only)

`labels = [-100] * len(prompt_ids) + answer_ids`, then any trailing pad positions also set to `-100`.
`IGNORE_INDEX = -100`.

This is a deliberate deviation from LLaVA-1.5's original SFT script, which computes loss over the
whole sequence including the question tokens. Prompt-masked loss is the standard modern recipe
(`llava-hf`), converges faster per step, and makes the loss number directly interpretable as
"how well are we predicting the answer". Note the deviation in the results table.

### 4.3 Tokenizer call (the fiddly bit — paste this as-is)

```python
from app.ml.constants import IGNORE_INDEX, IMAGE_TOKEN

def tokenize_example(tokenizer, question, answer, num_image_tokens, max_seq_len):
    prompt_text = PROMPT_TEMPLATE.format(question=question.strip())
    answer_text = "" if answer is None else ANSWER_TEMPLATE.format(answer=answer.strip())

    prompt_ids = tokenizer(prompt_text, add_special_tokens=True).input_ids
    image_id = tokenizer.convert_tokens_to_ids(IMAGE_TOKEN)

    expanded = []
    for token_id in prompt_ids:
        if token_id == image_id:
            expanded.extend([image_id] * num_image_tokens)
        else:
            expanded.append(token_id)

    if answer_text:
        answer_ids = tokenizer(answer_text, add_special_tokens=False).input_ids
        labels = [IGNORE_INDEX] * len(expanded) + list(answer_ids)
        input_ids = expanded + answer_ids
    else:
        input_ids = expanded
        labels = [IGNORE_INDEX] * len(expanded)

    input_ids = input_ids[:max_seq_len]
    labels = labels[:max_seq_len]
    return input_ids, labels
```

Two things to get right and neither is obvious:

- `add_special_tokens=True` on the prompt inserts the LLaMA `<s>` exactly once. The answer must use
  `add_special_tokens=False`, otherwise you get a second `<s>` mid-sequence.
- `answer_text` starts with a **space**. LLaMA's SentencePiece tokenizer is whitespace-sensitive:
  `tokenizer(" dog")` and `tokenizer("dog")` produce different ids, and the one you want is the one
  consistent with how `ASSISTANT:` was tokenized. Without the leading space the first answer token
  is mis-segmented and you lose a small but real amount of accuracy.

Truncate to `max_seq_len` **after** expansion and truncate `labels` in lockstep. Truncating the
labels array independently is the classic silent bug: it desynchronises the two sequences and the
model trains on shifted targets.

### 4.4 Answer extraction from generated text

```python
def extract_answer(raw: str) -> str:
    for stop in ("\n", "</s>", "USER:"):
        idx = raw.find(stop)
        if idx != -1:
            raw = raw[:idx]
    raw = raw.strip()
    if raw.endswith("."):
        raw = raw[:-1]
    return raw.strip()
```

Then `strip_model_answer()` from §5.1. This two-step order matters: stop-token truncation first,
then normalisation. Doing it the other way round leaves the newline glued to the answer.

---

## 5. Answer post-processing and the VQA accuracy metric

This is the single most important piece of code in the project for your reported number, and it is
the piece most often got wrong. It lives in `backend/app/ml/answer_postprocess.py`, is pure Python,
and is imported by training, evaluation, and the API.

### 5.1 `strip_model_answer` — minimal normalisation of the raw generation

```python
def strip_model_answer(raw: str) -> str:
    answer = raw.strip().lower().strip().strip(",").strip(".").strip()
    if answer in {"ref.", "ref", "reference."}:
        return "reference"
    if answer in {"<unk>", "unk", "unknown."}:
        return "unknown"
    return answer
```

### 5.2 `normalize_answer` — the official VQA evaluator normalisation

This is a faithful port of `vqaEval.py` from the VQA evaluation kit
(`https://github.com/GT-Vision-Lab/VQA`). The odd-looking bits (`commaStrip` deleting the middle
digit, the punctuation loop consulting a global condition) are **bugs in the original** that the
official leaderboard is computed with. Do not "fix" them — if your offline number disagrees with
EvalAI, this function is the first place to look.

```python
import re

_ARTICLES = ("a", "an", "the")
_PUNCT = (';', r"/", '[', ']', '"', '{', '}', '(', ')', '=', '+', '\\', '_', '-', '>', '<', '@',
          '`', ',', '?', '!')
_PERIOD_STRIP = re.compile(r"(?!<=\d)(\.)(?!\d)")
_COMMA_STRIP = re.compile(r"(\d)(\,)(\d)")

_DIGIT_MAP = {'none': '0', 'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
              'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'}

_CONTRACTIONS = {
    "aint": "ain't", "arent": "aren't", "cant": "can't", "couldve": "could've",
    "couldnt": "couldn't", "couldn'tve": "couldn't've", "couldnt've": "couldn't've",
    "didnt": "didn't", "doesnt": "doesn't", "dont": "don't", "hadnt": "hadn't",
    "hadnt've": "hadn't've", "hadn'tve": "hadn't've", "hasnt": "hasn't", "havent": "haven't",
    "hed": "he'd", "hed've": "he'd've", "he'dve": "he'd've", "hes": "he's",
    "howd": "how'd", "howll": "how'll", "hows": "how's", "Id've": "I'd've", "I'dve": "I'd've",
    "Im": "I'm", "Ive": "I've", "isnt": "isn't", "itd": "it'd", "itd've": "it'd've",
    "it'dve": "it'd've", "itll": "it'll", "let's": "let's", "maam": "ma'am",
    "mightnt": "mightn't", "mightnt've": "mightn't've", "mightn'tve": "mightn't've",
    "mightve": "might've", "mustnt": "mustn't", "mustve": "must've", "neednt": "needn't",
    "notve": "not've", "oclock": "o'clock", "oughtnt": "oughtn't", "ow's'at": "'ow's'at",
    "'ows'at": "'ow's'at", "'ow'sat": "'ow's'at", "shant": "shan't", "shed've": "she'd've",
    "she'dve": "she'd've", "she's": "she's", "shouldve": "should've", "shouldnt": "shouldn't",
    "shouldnt've": "shouldn't've", "shouldn'tve": "shouldn't've",
    "somebody'd": "somebodyd", "somebodyd've": "somebody'd've",
    "somebody'dve": "somebody'd've", "somebodyll": "somebody'll", "somebodys": "somebody's",
    "someoned": "someone'd", "someoned've": "someone'd've", "someone'dve": "someone'd've",
    "someonell": "someone'll", "someones": "someone's", "somethingd": "something'd",
    "somethingd've": "something'd've", "something'dve": "something'd've",
    "somethingll": "something'll", "thats": "that's", "thered": "there'd",
    "thered've": "there'd've", "there'dve": "there'd've", "therere": "there're",
    "theres": "there's", "theyd": "they'd", "theyd've": "they'd've", "they'dve": "they'd've",
    "theyll": "they'll", "theyre": "they're", "theyve": "they've", "twas": "'twas",
    "wasnt": "wasn't", "wed've": "we'd've", "we'dve": "we'd've", "weve": "we've",
    "werent": "weren't", "whatll": "what'll", "whatre": "what're", "whats": "what's",
    "whatve": "what've", "whens": "when's", "whered": "where'd", "wheres": "where's",
    "whereve": "where've", "whod": "who'd", "whod've": "who'd've", "who'dve": "who'd've",
    "wholl": "who'll", "whos": "who's", "whove": "who've", "whyll": "why'll",
    "whyre": "why're", "whys": "why's", "wont": "won't", "wouldve": "would've",
    "wouldnt": "wouldn't", "wouldnt've": "wouldn't've", "wouldn'tve": "wouldn't've",
    "yall": "y'all", "yall'll": "y'all'll", "yallll": "y'all'll", "yall'd've": "y'all'd've",
    "y'alld've": "y'all'd've", "y'all'dve": "y'all'd've", "youd": "you'd",
    "youd've": "you'd've", "you'dve": "you'd've", "youll": "you'll", "youre": "you're",
    "youve": "you've",
}


def _process_punctuation(text: str) -> str:
    out = text
    for punct in _PUNCT:
        if (punct + " " in text or " " + punct in text) or _COMMA_STRIP.search(text):
            out = out.replace(punct, "")
        else:
            out = out.replace(punct, " ")
    return _PERIOD_STRIP.sub("", out)


def _process_digit_article(text: str) -> str:
    kept = []
    for word in text.lower().split():
        word = _DIGIT_MAP.setdefault(word, word)
        if word not in _ARTICLES:
            kept.append(word)
    expanded = []
    for word in kept:
        expanded.append(_CONTRACTIONS.get(word, word))
    return " ".join(expanded)


def normalize_answer(text: str) -> str:
    text = text.replace("\n", " ").replace("\t", " ").strip()
    return _process_digit_article(_process_punctuation(text))
```

Note on the punctuation loop: the `or _COMMA_STRIP.search(text)` clause makes the behaviour of
**every** punctuation mark depend on whether the whole string contains a `digit,digit` somewhere. If
it does, all punctuation is *deleted*; if not, it is replaced with a *space*. The observable
consequence is that a thousands separator disappears entirely rather than becoming a token boundary:
`"1,000"` normalises to `"1000"`, not `"1 000"`, and `"1,000, and 2 more"` to `"1000 and 2 more"`.
Separately, `-` and `/` are on the punct list, so `"t-shirt"` normalises to `"t shirt"` and `"n/a"`
to `"n"` (the trailing `a` is then stripped as an article). All of this is what the official scorer
does. Reproduce it exactly — these are quirks of `vqaEval.py`, not bugs of yours.

### 5.2.1 Verified behaviour

The port above was executed against these cases. Use them as the regression suite in T1.2.

| Input | Output |
|---|---|
| `"Yes."` | `"yes"` |
| `"A dog"` | `"dog"` |
| `"two"` | `"2"` |
| `"Don't"` / `"DONT"` | `"don't"` |
| `"It's yellow."` | `"it's yellow"` |
| `"The  Big  Dog."` | `"big dog"` |
| `"  Skateboard  "` | `"skateboard"` |
| `"3,000"` | `"3000"` |
| `"1,000, and 2 more"` | `"1000 and 2 more"` |
| `"What is he doing?"` | `"what is he doing"` |
| `"1.5"` | `"1.5"` (decimal points are preserved) |
| `"t-shirt"` | `"t shirt"` |
| `"n/a"` | `"n"` |
| `"he'd"` | `"he'd"` |
| `"Thirty"` | `"thirty"` (only number words 0–10 are mapped) |

### 5.3 The accuracy metric

For each question with 10 human answers, and one model prediction `p`:

```
matches   = number of the 10 human answers whose normalised form equals normalised(p)
score     = min(1.0, matches / 3.0)
accuracy  = mean(score) over all questions
```

Three details that are easy to get wrong:

1. **Count over all 10 answers including duplicates**, not over the set of unique answers. `["down",
   "down", "at table", ...]` has two `"down"` entries and they both count. Using a set caps the
   contribution of repeated answers and inflates your number.
2. `matches / 3`, capped at 1. Three or more agreeing annotators = full credit.
3. Use `multiple_choice_answer` **only** for analysis, never for scoring. The metric is over all 10.

```python
class VQAScorer:
    def __init__(self) -> None:
        self._scores: list[float] = []
        self._exact: list[bool] = []
        self._by_type: dict[str, list[float]] = {}

    def add(self, prediction: str, human_answers, answer_type: str = "other") -> float:
        pred = normalize_answer(prediction)
        matches = sum(normalize_answer(a) == pred for a in human_answers)
        score = min(1.0, matches / 3.0)
        self._scores.append(score)
        self._exact.append(matches > 0)
        self._by_type.setdefault(answer_type, []).append(score)
        return score

    def summary(self) -> dict:
        return {
            "accuracy": sum(self._scores) / len(self._scores),
            "exact_match": sum(self._exact) / len(self._exact),
            "num_questions": len(self._scores),
            "by_answer_type": {
                k: {"accuracy": sum(v) / len(v), "n": len(v)}
                for k, v in sorted(self._by_type.items())
            },
        }
```

Always report `by_answer_type`. VQA v2's three types behave very differently and a flat number hides
failures: `yes/no` accuracy will be high (~85 %) while `number` will be much lower (~45 %). If `number`
accuracy collapses, suspect the leading-space bug in §4.3.

### 5.4 Baselines you must compute

Run all four in `ml/evaluate.py --baseline`. They are cheap and they make the headline number credible.

| Baseline | How |
|---|---|
| Always `"yes"` | one prediction, scored |
| Always `"no"` | one prediction, scored |
| Most-frequent answer in **train** | argmax of train answer counts. Never build this from val |
| Zero-shot CLIP answer-vocabulary match | embed the image once, embed every train answer with CLIP's text encoder, take argmax cosine. ~60 % is the number to beat for "no LLM" |

---

## 6. Data pipeline

### 6.1 Downloads

All URLs, verified against `visualqa.org/download.html` and the official
`visualqa.org/downloads` instructions. Get the licence agreement sorted before downloading.

```bash
mkdir -p data/vqa/raw data/coco
cd data/vqa/raw

wget https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Questions_Train_mscoco.zip
wget https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Questions_Val_mscoco.zip
wget https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Questions_Test_mscoco.zip
wget https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Annotations_Train_mscoco.zip
wget https://s3.amazonaws.com/cvmlp/vqa/mscoco/vqa/v2_Annotations_Val_mscoco.zip

unzip -q v2_Questions_Train_mscoco.zip
unzip -q v2_Questions_Val_mscoco.zip
unzip -q v2_Questions_Test_mscoco.zip
unzip -q v2_Annotations_Train_mscoco.zip
unzip -q v2_Annotations_Val_mscoco.zip

cd ../../coco
wget http://images.cocodataset.org/zips/train2014.zip
wget http://images.cocodataset.org/zips/val2014.zip
unzip -q train2014.zip
unzip -q val2014.zip
```

| Split | Questions | Images | Human answers |
|---|---:|---:|---:|
| `train` | 443,757 | 82,783 (train2014) + 40,504 (val2014) | 4,437,570 |
| `val` | 214,354 | same images | 2,143,540 |
| `test` | 447,793 | 81,434 (test2015) | withheld |
| `test-dev2015` | 107,394 | test2015 subset | withheld |

Two things to internalise:

- **VQA v2 `train` draws images from BOTH COCO `train2014` and `val2014`.** Extracting only
  `train2014.zip` silently drops ~1/3 of your training data and every such example just vanishes
  from the dataset. The image path in the question JSON tells you which zip it is in — see §6.2.
- `test-dev2015` has **no public answers**. Scoring it means submitting to
  https://evalai.cloudcv.org/ (§9.3). Local evaluation uses `val` only.

Disk: ~19 GB of images, ~2 GB of JSON. Budget 30 GB free.

### 6.2 Output format — one JSONL file per split

`ml/data/prepare_vqa_v2.py` writes `data/vqa/processed/{split}.jsonl`, one JSON object per line:

```json
{"question_id": 262148000, "image_id": 262148, "image": "train2014/COCO_train2014_000000262148.jpg", "question": "Where is he looking?", "answer": "down", "answers": ["down", "down", "at table", "skateboard", "down", "table", "down", "down", "down", "down"], "answer_type": "other", "question_type": "none of the above"}
```

- `image` is a path **relative to `data/coco/`**. Resolve it as `data/coco/<image>`.
- `answer` is the most common of the 10 human answers, tie-broken by first occurrence. This is the
  default training target. Add `"answers"` so `answer_sampling: random` (§8.2) can pick a different
  human answer per epoch — a free regulariser that costs nothing.
- The merge key between questions and annotations is `question_id`; between annotations and images
  it is `image_id`. Join on those, never on list index.

Splits produced:

| File | Rows | Purpose |
|---|---:|---|
| `train.jsonl` | 443,757 | final training |
| `train_smoke.jsonl` | 256 | pipeline check |
| `overfit64.jsonl` | 64 | the overfit gate (§8.4) |
| `train_dev.jsonl` | 50,000 | ablations, hyperparameter search |
| `val_smoke.jsonl` | 5,000 | fast iteration eval |
| `val.jsonl` | 214,354 | headline number |
| `test_dev2015.jsonl` | 107,394 | EvalAI submission |

Sample deterministically with a fixed seed (`random.Random(0).sample(...)`) so every run sees the
same subset.

### 6.3 Dataset class contract

```python
class VQAv2Dataset(torch.utils.data.Dataset):
    def __init__(self, jsonl_path, image_root, tokenizer, num_image_tokens, max_seq_len=640,
                 image_processor=None, answer_sampling="most_common", seed=0, limit=None): ...

    def __len__(self) -> int: ...

    def __getitem__(self, index) -> dict:
        # returns {"input_ids": LongTensor[T], "labels": LongTensor[T],
        #          "pixel_values": FloatTensor[3, 336, 336]}
```

- `pixel_values` is produced by the **shared** `CLIPImageProcessor` (`image_processor(images=...)`,
  `return_tensors="pt"`). The same object the serving path uses.
- Images are opened with PIL, converted to RGB (VQA v2 images are JPEG and all RGB, but be
  defensive), and passed through the processor. No manual `ToTensor`, no manual `Normalize`.
- Do **not** precompute and cache image features. It would fit (300 MB × 576 × 1024 × 2 bytes ≈
  354 GB — it does not fit). Loading CLIP is ~1 s of a step that takes ~1.5 s, and it overlaps with
  dataloader workers if `num_workers >= 4`. This is the single most common premature optimisation in
  LLaVA training; skip it.
- `num_workers=8`, `pin_memory=True`, `persistent_workers=True`, `prefetch_factor=4`. The dataloader
  is JPEG-decode-bound; without workers you will idle the GPU.

### 6.4 Collator contract

```python
def make_collator(tokenizer, pad_token_id, ignore_index=-100):
    def collate(batch: list[dict]) -> dict:
        max_len = max(len(item["input_ids"]) for item in batch)
        input_ids, labels, attention_mask = [], [], []
        for item in batch:
            pad = max_len - len(item["input_ids"])
            input_ids.append(torch.cat([item["input_ids"], torch.full((pad,), pad_token_id, dtype=torch.long)]))
            labels.append(torch.cat([item["labels"], torch.full((pad,), ignore_index, dtype=torch.long)]))
            attention_mask.append(torch.cat([torch.ones(len(item["input_ids"]), dtype=torch.long),
                                             torch.zeros(pad, dtype=torch.long)]))
        return {
            "input_ids": torch.stack(input_ids),
            "labels": torch.stack(labels),
            "attention_mask": torch.stack(attention_mask),
            "pixel_values": torch.stack([item["pixel_values"] for item in batch]),
        }
    return collate
```

`pixel_values` from `torch.stack` requires every item to be `[3, 336, 336]` with identical shape —
the processor guarantees this. If you ever switch to variable-resolution, this breaks.

---

## 7. Reference implementation

These are the modules that are fiddly, short, and where a mistake is silent. Implement them exactly.
The training and evaluation loops (§8, §9) are ordinary PyTorch and are specified by signature and
behaviour rather than given verbatim.

### 7.1 `backend/app/ml/constants.py`

```python
IMAGE_TOKEN = "<image>"
IGNORE_INDEX = -100
```

### 7.2 `backend/app/ml/answer_postprocess.py`

Contains §5.1, §5.2, §5.3. Public API:

```python
def strip_model_answer(raw: str) -> str
def normalize_answer(text: str) -> str
def extract_answer(raw: str) -> str          # §4.4
class VQAScorer: ...                          # §5.3
```

Import surface must be exactly: `import re` and nothing else. No numpy, no torch, no transformers.
This keeps it importable by the API, by `ml/evaluate.py`, and by CI with zero ML dependencies
installed.

### 7.3 `backend/app/ml/projector.py`

```python
class LlavaProjector(nn.Module):
    def __init__(self, vision_hidden_size: int, text_hidden_size: int,
                 layer_norm: bool = False) -> None:
        super().__init__()
        layers: list[nn.Module] = [
            nn.Linear(vision_hidden_size, text_hidden_size),
            nn.GELU(),
            nn.Linear(text_hidden_size, text_hidden_size),
        ]
        if layer_norm:
            layers.insert(0, nn.LayerNorm(vision_hidden_size))
        self.net = nn.Sequential(*layers)

    def forward(self, image_features: torch.Tensor) -> torch.Tensor:
        return self.net(image_features)
```

### 7.4 `backend/app/ml/model.py`

```python
class LlavaForVQA(nn.Module):
    def __init__(self, llm, projector, vision_tower, processor, num_image_tokens: int,
                 prompt_template: str, answer_template: str, system_prompt: str) -> None: ...

    def encode_images(self, pixel_values: torch.Tensor) -> torch.Tensor:
        """[B, 3, H, W] -> [B, num_image_tokens, text_hidden_size]"""
        out = self.vision_tower(pixel_values=pixel_values, output_hidden_states=False)
        feats = out.last_hidden_state[:, 1:, :]
        return self.projector(feats)

    def build_prompt_ids(self, tokenizer, question: str) -> list[int]:
        """Expands the single <image> id into num_image_tokens copies."""

    def forward(self, input_ids, attention_mask, labels, pixel_values) -> dict:
        """Returns {"loss": scalar, "logits": ...}. Loss = causal LM loss on the whole
        sequence with labels pre-masked by the caller."""

    @torch.no_grad()
    def generate(self, input_ids, attention_mask, pixel_values, max_new_tokens=10) -> dict:
        """Returns {"sequences", "answer_token_ids", "mean_logprob"}. Greedy."""
```

`derive_num_image_tokens(vision_config)`:

```python
def derive_num_image_tokens(vision_config) -> int:
    return (vision_config.image_size // vision_config.patch_size) ** 2
```

Nothing in the codebase may hardcode `576`. Changing the vision tower must require only a config
change.

The splice, which is the heart of the model:

```python
inputs_embeds = self.llm.get_input_embeddings()(input_ids)
mask = input_ids == image_token_id
if mask.sum() != batch_size * num_image_tokens:
    raise ValueError(f"expected {batch_size * num_image_tokens} image slots, got {int(mask.sum())}")
inputs_embeds = inputs_embeds.clone()
inputs_embeds[mask] = image_features.reshape(-1, text_hidden_size)
```

The `raise` is not defensive programming, it is an assertion that catches the single most common
silent failure (token count mismatch after a tokenizer or tower change). Keep it.

Splice mechanics, for reference: `inputs_embeds[mask]` with a `[B*N]` boolean mask selects
`B * num_image_tokens` rows in row-major order, and `image_features.reshape(-1, H)` is laid out
`[B][N][H]` in the same order. The assignment is therefore correct without an explicit reshape of
the mask. `inputs_embeds.clone()` first because `inputs_embeds` may be a view into the embedding
matrix and in-place writes would corrupt it.

### 7.5 `backend/app/ml/config.py`

A dataclass, not pydantic, not OmegaConf. Loaded from YAML with `pyyaml` and validated by
`__post_init__` raising on unknown or missing keys. Required keys:

```
llm_name, vision_name, torch_dtype, quantization{load_in_4bit,bnb_4bit_compute_dtype,
bnb_4bit_quant_type,bnb_4bit_use_double_quant},
lora{r,alpha,dropout,target_modules}, projector{vision_hidden_size,text_hidden_size,layer_norm},
data{train_jsonl,val_jsonl,image_root,max_seq_len,answer_sampling,num_workers},
train{micro_batch_size,grad_accum_steps,epochs,max_steps,lr,weight_decay,warmup_ratio,
      lr_scheduler,gradient_checkpointing,log_every,eval_every,save_every,seed,stage},
prompt{system_prompt,prompt_template,answer_template}, inference{max_new_tokens,
      clarification{mean_logprob_threshold,max_answer_chars}}
```

`llm_name`, `vision_name`, `text_hidden_size` and `vision_hidden_size` must be **consistent**.
Add a `validate()` that asserts, e.g., 576 → 1024 for `clip-vit-large-patch14-336` and 4096 for
`vicuna-7b-v1.5`, and fails loudly on a mismatch. This catches a stale config at startup instead of
at step 9,000.

### 7.6 Three config files

| File | Purpose |
|---|---|
| `ml/configs/smoke.yaml` | TinyLlama-1.1B + clip-vit-base-patch32, 256 samples, 200 steps. Runs on a T4 in < 10 min |
| `ml/configs/dev.yaml` | Same small models, 50k samples, full recipe. For ablations |
| `ml/configs/full.yaml` | Vicuna-7B-v1.5 + clip-vit-large-patch14-336, 443k samples. The real run |

Having `smoke` on a different vision tower is deliberate: it proves nothing is hardcoded to 576.

---

## 8. Training

### 8.1 Two stages, and why

Training the projector while the LLM is random-adapter is unstable: at step 0 the 4-bit LLM emits
near-uniform output, so the projector's gradient signal is dominated by noise. Warm the projector up
first with the LLM's cross-entropy detached, so the LLM acts as a fixed feature extractor.

**Stage 1 — projector warmup**

| Parameter | Value |
|---|---|
| Trainable | projector only (21.0 M) |
| LLM | loaded in 4-bit NF4, `requires_grad_(False)`, **and the forward pass runs under `torch.no_grad()`** on the LLM sub-module |
| Optimiser | `AdamW`, lr `1e-3`, betas `(0.9, 0.999)`, weight_decay `0.0`, `eps=1e-8` |
| LR schedule | cosine to 0 over the full stage, 100 warmup steps |
| Batch | micro 16, accum 4 → effective 64 (no grad checkpointing needed; 4-bit base is 1.9 GB) |
| Steps | 2,000 |
| Precision | bf16 (Ampere+) else fp16 + `GradScaler` |
| Output | `runs/<name>/stage1/projector.pt` |

**Stage 2 — QLoRA + projector**

| Parameter | Value |
|---|---|
| Trainable | projector (21.0 M) + LoRA adapters (159.9 M) |
| Optimiser | `AdamW`, lr `2e-4`, betas `(0.9, 0.999)`, weight_decay `0.0`, `eps=1e-8` |
| LR groups | projector `lr * 10 = 2e-3`, LoRA `lr = 2e-4` |
| LR schedule | cosine to 0, warmup_ratio `0.03` |
| Batch | micro 4, accum 8 → effective 32 |
| Sequence | 640, dynamic padding, right-pad |
| Gradient checkpointing | LLM only, `use_cache=False` |
| Precision | bf16 (no GradScaler) else fp16 + `GradScaler(loss_scale_growth_interval=2000)` |
| Max grad norm | `clip_grad_norm_(trainable_params, 1.0)` |
| Steps | 1 epoch over 443,757 → 13,868 optimiser steps |
| Eval every | 2,000 steps, on `val_smoke` (5,000 q) |
| Save every | 2,000 steps → adapter + projector, overwrite `latest/` |
| Seeds | `torch`, `numpy`, `random` all set to `seed: 42`; `transformers.set_seed(42)` |

`weight_decay=0.0` deliberately. LoRA fine-tuning for ~14k steps does not benefit from weight decay
and it interacts badly with the 1e-2 effective LoRA scale at α/r = 2.0. If you want to explore
regularisation, that is ablation A5.

**Learning rates are the parameter you will tune first, in this order:**
projector lr (`1e-3` → `2e-2` is the useful range), LoRA lr (`1e-4` → `4e-4`), then everything else.

### 8.2 Training loop structure

```
load config → validate() → build tokenizer (+ add <image>) → build vision tower (freeze)
           → build LLM (4-bit) → resize embeddings → wrap in LlavaForVQA
           → get_trainable_parameters() → AdamW with 2 param groups
           → cosine schedule w/ warmup → DataLoader(make_collator(...), shuffle=True)
           → for step in range(max_steps):
                 micro-batches: forward → (loss / grad_accum).backward() → clip → step → zero_grad
                 every log_every:  log step, loss, lr, tokens/s, GPU mem, ETA
                 every eval_every:  greedy-generate on val_smoke, VQAScorer.summary(), tensorboard
                 every save_every:  save adapter + projector + processor + config
           → final full-val eval
```

Required functions:

```python
def get_trainable_parameters(model, lr: float, projector_lr_multiplier: float = 10.0):
    """Returns two param groups: projector params, LoRA params. Asserts exactly one of each
    is non-empty — if the model has no LoRA adapters the stage-1 run should have said so."""

def save_checkpoint(run_dir, model, tokenizer, processor, config, step) -> None
def load_checkpoint(run_dir, model, tokenizer, processor) -> dict
def evaluate_split(model, dataloader, scorer, max_new_tokens) -> dict
```

`evaluate_split` must call `model.eval()` and `torch.inference_mode()`, and `model.train()` +
gradient unscaling must be restored afterwards. Leaving the model in `eval()` after the first eval
call is a classic bug that costs 2–3 % accuracy and produces no error.

### 8.3 Hardware feasibility

Effective batch 32 × 640 tokens = 20,480 tokens per optimiser step.

| GPU | Config that fits | Wall clock for 1 epoch |
|---|---|---|
| 1× A100-40GB | micro 8, accum 4 | ~9–13 h |
| 1× A100-80GB | micro 16, accum 2 | ~6–9 h |
| 1× RTX 4090-24GB | micro 4, accum 8 | ~20–26 h |
| 1× RTX 3090-24GB | micro 2, accum 16 | ~34–44 h |
| 1× T4-16GB (Colab) | micro 1, accum 32 | ~90–120 h — **not recommended** |

Measure before you trust these: run 200 steps with `--max-steps 200` and divide. Do not guess.
If you only have a T4, use `TinyLlama_v1.1` + `clip-vit-base-patch32` for the full pipeline and
report that result honestly as a scaled-down reproduction; a 1.1B model reaches roughly 55–62 %
on VQAv2 and still demonstrates every mechanism in this document.

Disk for checkpoints: adapter 159.9 M × 2 bytes = 320 MB, projector 21 M × 4 = 84 MB. Keep
`latest/` plus the two best-by-accuracy checkpoints. ~1.5 GB total.

### 8.4 The overfit gate — do not skip

Before any long run, prove the model can memorise 64 examples. This is the single highest-value
15 minutes in the whole project: it separates "my model is broken" from "my model needs more
compute" in one shot.

```bash
python ml/train.py --config ml/configs/smoke.yaml \
  --train-jsonl data/vqa/processed/train_smoke.jsonl \
  --max-steps 200 --eval-every 200 --run-name overfit64
```

Success: training loss < 0.05 **and** VQA accuracy on those same 64 examples = 1.00.

If loss plateaus above ~1.5, the bug is almost always one of, in order of likelihood:
image tokens not spliced (§7.4) → `labels` desynchronised from `input_ids` (§4.3) →
`IGNORE_INDEX` not `-100` → wrong `pad_token_id` → projector output dimension mismatch.

---

## 9. Evaluation

### 9.1 Local evaluation

```bash
python ml/evaluate.py \
  --run-dir runs/full/stage2/latest \
  --val-jsonl data/vqa/processed/val.jsonl \
  --image-root data/coco \
  --batch-size 16 \
  --max-new-tokens 10 \
  --out runs/full/eval_val.json
```

Greedy decoding, `do_sample=False`, `num_beams=1`, `max_new_tokens=10`. Output:

```json
{
  "run_dir": "...",
  "num_questions": 214354,
  "accuracy": 0.7xxx,
  "exact_match": 0.5xxx,
  "by_answer_type": {"number": {"accuracy": 0.4x, "n": ...},
                     "other":  {"accuracy": 0.6x, "n": ...},
                     "yes/no": {"accuracy": 0.8x, "n": ...}},
  "latency": {"p50_ms": ..., "p95_ms": ..., "qps": ...},
  "config": { ... }
}
```

Also write `predictions.jsonl` (one row per question with the raw generation and the extracted
answer). You will need it for error analysis and for §10.4's threshold calibration.

### 9.2 Confidence intervals

Report the 95 % CI on `accuracy` with `scipy.stats.norm.ppf` or the normal approximation
`1.96 * sqrt(acc * (1 - acc) / n)`. At n = 214,354 the CI is about ±0.002, i.e. 0.2 points. At
n = 5,000 (`val_smoke`) it is ±1.3 points — **ablation differences smaller than 2.5 points on
`val_smoke` are noise.** Use `val` for anything you intend to report.

### 9.3 test-dev2015 and EvalAI

```bash
python ml/evaluate.py \
  --run-dir runs/full/stage2/latest \
  --val-jsonl data/vqa/processed/test_dev2015.jsonl \
  --image-root data/coco \
  --out runs/full/pred_testdev2015.json \
  --submission-format
```

Submission format is exactly:

```json
[{"question_id": 262148000, "answer": "down"}]
```

Flat JSON array, one object per question, no extra keys, no nesting, no trailing commas. Upload at
https://evalai.cloudcv.org/ under the VQA challenge → test-dev2015 split. The score it returns is the
number to quote. An offline/online gap > 0.3 points means your `normalize_answer` differs from
`vqaEval.py` — diff them line by line (§5.2 is the reference).

**Do not** report test-dev2015 accuracy as your primary number. The val number is the one you
controlled; test-dev2015 is a one-shot submission.

### 9.4 Required ablations

Run each on `train_dev` (50k) + `val_smoke` (5k) and report in a single table. This table is the
substance of the write-up.

| # | Ablation | Command change | Expected effect |
|---|---|---|---|
| A1 | Random projector init, no stage 1 | skip stage 1, train QLoRA from scratch | −4 to −8 points. The headline justification for two-stage training |
| A2 | System prompt removed | `use_system_prompt: false` | ±0.5. Usually noise |
| A3 | `answer_sampling: random` vs `most_common` | config flag | +0.5 to +1.5 with random |
| A4 | Projector with `layer_norm: true` | config flag | ±0.5 |
| A5 | LoRA rank 16 vs 64 vs 128 | config flag | 64 ≥ 128 > 16, monotone flattening |
| A6 | `clip-vit-base-patch32` vs `clip-vit-large-patch14-336` | config flag | +3 to +6 for L/14-336. Justifies the 576-token choice |
| A7 | Closed-vocab classifier head instead of free generation | see note | +2 to +4, and much faster. See note |

Note on A7: replacing the LM head with an `nn.Linear(4096, V)` classifier over the VQA answer
vocabulary, scoring only the last prompt token. It is faster, it constrains output to legal answers,
and it is a stronger model for VQA v2 specifically — but it is **not** a language model and it cannot
produce the free-form natural-language answers the README describes. If you do A7, keep it as an
ablation and keep free generation as the shipped model.

### 9.5 Error analysis (required for the write-up, ~1 hour)

From `predictions.jsonl`, sample 100 questions where `score < 0.5` and classify the failure:

| Category | Example | Share to expect |
|---|---|---|
| Ambiguous question | "What is he doing?" with 4 distinct answers among the 10 | 30–40 % |
| Counting failure | "How many people?" → 3, humans say 4 | 10–15 % |
| Object too small / occluded | | 10–15 % |
| Yes/no calibration | answer is technically one of the 10 but scored 0 | 10 % |
| Genuine model error | | 20–30 % |

If "ambiguous question" dominates, say so. It is the honest, interesting finding: VQA v2's residual
error is largely human disagreement, not model failure. That observation is worth more in a
portfolio than a spurious 1-point gain.

---

## 10. Inference service and the `/ask` API

### 10.1 Model loading

Load once, lazily, at FastAPI lifespan startup, onto a module-level singleton so it survives across
requests. Loading Vicuna-7B takes ~30 s; doing it per request is a 30 s p50 latency.

```python
# backend/app/services/vqa_service.py
class VQAService:
    def __init__(self, run_dir: Path, device: str = "cuda") -> None: ...
    def load(self) -> None: ...
    def answer(self, image: bytes, question: str) -> AskResponse: ...
    @property
    def is_ready(self) -> bool: ...
```

Rules:

- `run_dir` comes from env var `ASKSIGHT_RUN_DIR`, defaulting to `ml/runs/full/stage2/latest`.
- Wrap loading in `try/except` and set a `load_error` string. If loading fails, the app still starts
  and `/health` still returns 200; `/ask` returns **503** with that error. A dead `/health` makes the
  failure undiagnosable in CI and in a demo.
- `torch.inference_mode()` around generate. `model.eval()` once at load, not per request.
- Load the `CLIPProcessor` from `run_dir` via `CLIPProcessor.from_pretrained(run_dir)`, not by
  passing the model name. This is the train/serve skew guard (§2.1).

### 10.2 Upload validation

| Rule | Value | Rejection |
|---|---|---|
| Content type | `image/jpeg`, `image/png`, `image/webp` | 415 |
| Size | ≤ 10 MB | 413 |
| Min dimension | ≥ 32 px | 400 |
| Max dimension | ≤ 4000 px | 400 |
| Decodable | PIL `Image.open(...).verify()` then reopen | 400 |
| Mode | forced to `RGB` | — |

Validate **before** any model call. A 40 MP photo will OOM a 16 GB GPU and take the process down
with it.

### 10.3 Endpoint contract

```http
POST /ask
Content-Type: multipart/form-data

file:     <binary>   required, the image
question: <string>   required, 1–512 chars after strip
```

```json
200 OK
{
  "question_id": "3f9a1c02-...",
  "question": "what does this sign say",
  "answer": "stop",
  "spoken_text": "The sign says stop.",
  "needs_clarification": false,
  "clarification_prompt": null,
  "confidence": 0.83,
  "latency_ms": 412
}
```

```json
422 Unprocessable Entity   missing field, question empty or > 512 chars
400 Bad Request            image undecodable, or dimensions out of range
413 Payload Too Large      image > 10 MB
415 Unsupported Media Type wrong content type
503 Service Unavailable    model not loaded; body carries load_error
```

`spoken_text` is built from `answer` with a template map (`{"2": "two."}` is overkill; use
`f"The answer is {answer}."` plus a short table for the ~40 answers where a bare word reads badly:
numbers as words, `yes`/`no`, and colours). Screen readers read the answer anyway; `spoken_text`
exists because the README promises a spoken answer.

`question_id` is a UUID that is also the `QueryLog.id`. Extend the Prisma model with a `String @id
@default(uuid())` primary key, a `questionId` string, and nullable `needsClarification`. Then:

```sql
-- created by the migration in T7.4
ALTER TABLE "QueryLog" ADD COLUMN "questionId" TEXT;
ALTER TABLE "QueryLog" ADD COLUMN "needsClarification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QueryLog" ADD COLUMN "latencyMs" INTEGER;
```

There are currently **no migrations at all** (`backend/prisma/` has only `schema.prisma`, and the
table has never been pushed). `T7.4` creates the first one. Do not assume the remote NeonDB matches
the schema file — run `prisma migrate diff` and look before you write to it.

### 10.4 Clarification fallback

There are no gold answers at inference time, so you cannot compute VQA accuracy. Use mean token
log-probability of the generated answer as the confidence signal, which `model.generate` can return
directly:

```python
out = model.generate(**inputs, max_new_tokens=10, do_sample=False,
                     output_scores=True, return_dict_in_generate=True)
answer_ids = out.sequences[0, prompt_len:]
logprobs = torch.stack(out.scores).log_softmax(-1)          # [T, V]
chosen = logprobs[torch.arange(len(answer_ids)), answer_ids]
mean_logprob = chosen.mean().item()
```

Confidence: `confidence = exp(mean_logprob)`.

Trigger `needs_clarification: true` when **any** of:

| Condition | Threshold | Rationale |
|---|---|---|
| `mean_logprob < t` | `t = -0.45` | calibrated in T8.3, not guessed |
| `len(answer) > max_answer_chars` | 40 | degenerate long generation |
| `answer.strip() == ""` | — | empty generation |

`clarification_prompt` when triggered: pick from a fixed list keyed on intent, e.g. for a low-confidence
answer `"I could not tell from this image. Could you move closer or ask a more specific question?"`.
Do not generate the clarification with the model — a fixed string is faster, deterministic, and
testable.

**Calibrate `t` properly.** Sweep `t` over `val_smoke` predictions and plot precision/recall against
the label "is this answer actually wrong" (`score < 0.5`). Choose the `t` at ~90 % precision. Report
that operating point. Do not ship a threshold you picked by intuition; it is one line of work.

### 10.5 Latency budget (7B, 1×A100-40GB, batch 1)

| Stage | Budget |
|---|---:|
| HTTP receive + image decode + validate | 40 ms |
| CLIP preprocess | 10 ms |
| CLIP forward, ViT-L/14-336, fp16 | 35 ms |
| Projector | 2 ms |
| LLM prefill, 620 tokens, fp16 | 120 ms |
| LLM decode, 10 tokens | 90 ms |
| **Total GPU** | **~260 ms** |
| JSON serialise | 5 ms |

p50 target ≤ 900 ms including Python overhead; the README's < 3 s budget has ~10× headroom. Measure
over 200 sequential requests, no concurrency. If you serve the 4-bit QLoRA model, decode is
noticeably slower than fp16 — measure on the served model, not a re-quantised copy.

---

## 11. Repository layout and dependency strategy

### 11.1 Final tree

```
AskSight/
├── README.md
├── PLAN/                       # this document
│   ├── README.md
│   ├── Architecture.md
│   └── Task.md
├── data/                       # gitignored, ~19 GB
│   ├── vqa/raw/
│   ├── vqa/processed/*.jsonl
│   └── coco/train2014/ val2014/
├── backend/
│   ├── requirements.txt        # API deps — unchanged by ML, stays CI-fast
│   ├── requirements-ml.txt     # NEW: torch + training deps, NOT installed in CI
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── db/prisma.py
│   │   ├── ml/                 # NEW: pure-Python, torch-free, CI-testable
│   │   │   ├── constants.py
│   │   │   ├── answer_postprocess.py
│   │   │   ├── projector.py    # torch, but never imported by the API
│   │   │   ├── model.py        # torch
│   │   │   ├── config.py
│   │   │   └── build.py        # assemble LlavaForVQA from a run_dir
│   │   ├── api/
│   │   │   └── ask.py          # NEW: POST /ask
│   │   ├── schemas/ask.py      # NEW: pydantic request/response
│   │   └── services/
│   │       ├── vqa_service.py  # NEW
│   │       └── query_log.py    # NEW
│   ├── prisma/schema.prisma
│   └── tests/
│       ├── test_health.py
│       ├── test_answer_postprocess.py   # NEW — the big one
│       ├── test_vqa_scorer.py           # NEW
│       ├── test_ask_api.py              # NEW — fake service via dependency_overrides
│       └── test_projector.py            # NEW — skipped if torch absent
├── ml/                         # NEW: training + evaluation, never imported by the API
│   ├── _bootstrap.py
│   ├── configs/{smoke,dev,full}.yaml
│   ├── data/
│   │   ├── prepare_vqa_v2.py
│   │   ├── vqa_dataset.py
│   │   ├── answer_vocab.py
│   │   └── collator.py
│   ├── train.py
│   ├── evaluate.py
│   └── runs/                   # gitignored
└── ui/                         # unchanged except for wiring to /ask
```

### 11.2 The dependency rule

The existing CI (`.github/workflows/backend-ci.yml`) installs `requirements.txt` and runs `pytest`
in well under two minutes. Adding `torch` (≈ 800 MB with CUDA) to `requirements.txt` breaks that
and will start timing out. Therefore:

- `backend/requirements.txt` — adds **only** `python-multipart` and `pillow`. Keeps CI fast.
- `backend/requirements-ml.txt` — torch and the training stack. Installed manually. Never in CI.
- `backend/app/ml/answer_postprocess.py` imports **only** `re`. That is the whole reason it can live
  in `app/` while `model.py` and `projector.py` sit beside it unused by the API.
- Every torch-touching test is guarded:

```python
torch = pytest.importorskip("torch")
```

This is why `pyproject.toml` gains no new markers and `--strict-markers` stays satisfied.

- CI gains one job: run `ml/prepare_vqa_v2.py` against a checked-in **tiny fixture** (32 synthetic
  examples in `backend/tests/fixtures/vqa/`) to catch data-prep breakage without a 19 GB download.
  Keep the fixture under 2 MB.

### 11.3 `ml/` reaching `app/`

`ml/` scripts live outside `backend/`, so they cannot `import app.ml`. Add `ml/_bootstrap.py`:

```python
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for candidate in (ROOT, ROOT / "backend"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))
```

Every `ml/*.py` entry point starts with `import _bootstrap  # noqa: F401` before any `app.` import.
Because `python ml/train.py` puts `ml/` on `sys.path[0]`, this works with **no package installation
and no root `pyproject.toml`**. Always invoke as `python ml/train.py ...` from the repo root; do not
use `python -m ml.train`. Put that constraint in the file docstring too.

### 11.4 `.gitignore` additions

```
data/
ml/runs/
*.pt
*.safetensors
ml/.venv/
.ipynb_checkpoints/
ml/__pycache__/
```

Checkpoints and images must never be committed. 320 MB adapters in git history is unrecoverable and
`git gc` will not save you.

---

## 12. Environment

### 12.1 Python version — the one real decision

**Use a single virtualenv on Python 3.11 for both the API and ML work**, at the repo root:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-ml.txt
```

Why 3.11 and not the 3.14 your current `backend/venv` uses: the torch/wheels/`flash-attn`/bitsandbytes
ecosystem has prebuilt wheels for 3.11 and frequently lags on brand-new interpreters. A 3.14 venv
will make you spend hours on source builds of things that should not need building.

CI is unaffected: it stays on Python 3.13 and installs only `requirements.txt`, which stays
3.11–3.14 compatible (it has no version-specific syntax today).

### 12.2 Installing torch correctly

Get this wrong and you get a 4 GB CPU-only build that appears to work and runs at 0.2 it/s:

```bash
pip install torch==2.5.1 torchvision==0.20.1 \
  --index-url https://download.pytorch.org/whl/cu121
pip install -r backend/requirements-ml.txt
```

Verify immediately — do not defer this to "later" when you wonder why it is slow:

```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

`True` and your GPU name, or stop and fix it now.

### 12.3 `requirements-ml.txt`

```
torch==2.5.1
torchvision==0.20.1
transformers==4.46.3
accelerate==1.1.1
peft==0.13.2
bitsandbytes==0.44.1
datasets==3.1.0
sentencepiece==0.2.0
safetensors==0.4.5
tokenizers==0.20.3
huggingface-hub==0.26.2
numpy==1.26.4
pillow==11.0.0
pyyaml==6.0.2
tqdm==4.66.5
scipy==1.14.1
tensorboard==2.18.0
pytest==9.1.1
```

Pin everything. `torchvision` and `datasets`/`numpy` in particular have a hard incompatibility that
surfaces as `RuntimeError: operator torchvision::nms does not exist` at the first forward pass, and
that error message does not tell you the cause.

Do not add `flash_attn` for this project. `attn_implementation="sdpa"` is PyTorch's built-in
scaled-dot-product attention: no install step, no CUDA extension build, and within a few percent of
flash-attention throughput on these short sequences. Flash-attn saves you maybe 8 % and costs you an
afternoon.

After the environment is verified working, run `pip freeze > backend/requirements-ml.lock.txt` and
commit the lock. That, not the hand-written list, is what makes your results reproducible.

### 12.4 GPU drivers

`nvidia-smi` must show driver ≥ 525 for CUDA 12.1. If `torch.cuda.is_available()` is `False` on a
machine that has a GPU, it is a driver/runtime mismatch, not a PyTorch bug. Check
`nvidia-smi` first, then check that you installed from the `cu121` index rather than plain PyPI.

---

## 13. Gotchas that will cost you days

Ordered by how likely they are to actually happen to you.

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | Training loss plateaus near 2.0, model outputs garbage | Image tokens never spliced into the embedding stream | Assert `mask.sum() == batch * num_image_tokens` (§7.4) |
| 2 | Loss is fine, generations are reasonable, **accuracy is ~0** | `labels` desynchronised from `input_ids` by an off-by-one in truncation | Truncate both arrays together (§4.3) |
| 3 | `RuntimeError: operator torchvision::nms does not exist` | `torchvision` built against a different torch | Reinstall both from the same index (§12.3) |
| 4 | Accuracy 3–5 points below expectation | Missing leading space in the answer template | `ANSWER_TEMPLATE = " {answer}</s>"` (§4.3) |
| 5 | 1/3 of training data silently missing | Extracted only `train2014.zip`; VQA v2 train also uses `val2014` | Check the row count: 443,757 (§6.1) |
| 6 | Accuracy drops 2–3 points after the first eval | `model.eval()` never reverted to `model.train()` | Revert after every eval (§8.2) |
| 7 | Offline accuracy ≠ EvalAI by > 0.3 | Your `normalize_answer` diverges from `vqaEval.py` | Diff against §5.2 line by line |
| 8 | Local eval fine, `/ask` gives different answers | Serving re-resolves the processor by name | `CLIPProcessor.from_pretrained(run_dir)` (§10.1) |
| 9 | 0.2 it/s, GPU util 15 % | No dataloader workers | `num_workers=8, pin_memory, persistent_workers` (§6.3) |
| 10 | `CUDA out of memory` at step 1 | 4-bit bitsandbytes loaded on a non-Ampere GPU, or `use_cache` left `True` with gradient checkpointing | `use_cache=False`; bf16 only on Ampere+ |
| 11 | New `<pad>` embedding row is random noise in the output distribution | `add_special_tokens({"pad_token": "<pad>"})` | `tokenizer.pad_token = tokenizer.unk_token` (§3.3) |
| 12 | First answer token is always mangled (`▁two` → `▁▁two`) | SentencePiece whitespace sensitivity | Leading space in `ANSWER_TEMPLATE` |
| 13 | OOM killed on a real user photo | No size/dimension cap before the model call | §10.2 |
| 14 | EvalAI rejects the submission | Nested JSON or extra keys | Exactly `[{"question_id": ..., "answer": ...}]` (§9.3) |
| 15 | "Nothing in the dataset matches" during the overfit gate | `train_smoke.jsonl` was sampled after `--limit` instead of before | Sample then write (§6.2) |
| 16 | Reproduction gives ±1 point | Unpinned dependency, or an unseeded dataloader | `requirements-ml.lock.txt` + `seed: 42` (§8.1) |

---

## 14. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No GPU / GPU too small for 7B | medium | high | `smoke.yaml` + `dev.yaml` path with TinyLlama + ViT-B/32; the whole pipeline is identical. Fall back to A100 rental (RunPod ≈ $1.5/h) for the final 1-epoch run — 13 h ≈ $20 |
| Gated HF access denied for `vicuna-7b-v1.5` | medium | medium | Accept the licence while logged in, or use `TinyLlama/TinyLlama_v1.1` (ungated, same architecture family) |
| Training run dies at hour 9 of 13 | high | medium | Save every 2,000 steps; add `--resume runs/<name>/stage2/latest` that restores optimizer, scheduler, RNG and dataloader position |
| Local eval disagrees with EvalAI | medium | high | §5.2 is a verbatim port; validate with the 3-question sanity cases in T1.2 before any long run |
| `val_smoke` overfitting your decisions | high | medium | Never tune on a subset you will report; all reported numbers on full `val` |
| "It works but it's just a research notebook" | — | high | `POST /ask` is a hard deliverable; the README promises it. The 200-test latency benchmark is part of T10.3 |
| Scope creep into LLaVA-NeXT / multi-turn | high | high | §1.2 is a non-goals list; honour it |

---

## 15. References

Verify anything here you are unsure about; do not take a number on trust.

| Topic | Source |
|---|---|
| VQA dataset + downloads + licence | https://visualqa.org/ and https://visualqa.org/download.html |
| VQA v2 paper (Goyal et al., 2017) | https://arxiv.org/abs/1612.00837 |
| Official accuracy scorer `vqaEval.py` | https://github.com/GT-Vision-Lab/VQA |
| LLaVA paper | https://arxiv.org/abs/2310.03741 |
| LLaVA code (reference projector, training masks) | https://github.com/haotian-liu/LLaVA |
| `llava-hf` (prompt-masked training recipe) | https://github.com/LLaVA-VL/llava-hf |
| QLoRA paper + 4-bit NF4 details | https://arxiv.org/abs/2305.14314 |
| LoRA paper | https://arxiv.org/abs/2106.09685 |
| PEFT docs | https://huggingface.co/docs/peft |
| bitsandbytes docs | https://huggingface.co/docs/bitsandbytes |
| CLIP | https://openai.com/research/clip and https://github.com/openai/CLIP |
| EvalAI VQA challenge | https://evalai.cloudcv.org/ |
| LMMs-Eval (optional cross-check harness) | https://github.com/EvolvingLMMs-Lab/lmms-eval |
