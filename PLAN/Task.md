# AskSight — VQA v2 Multimodal Build Order

Executable task list for [`Architecture.md`](./Architecture.md). Every task is ordered so that each
one is verifiable before the next begins, and each ends with a command that either passes or fails.

**This document assumes you are a competent Python/ML engineer working without a coding assistant.**
Everything you need to type is specified. Nothing here requires you to invent a design decision, and
nothing here depends on a library whose API you have to guess — where an API matters (LoRA, 4-bit
quantisation, `generate()` output shapes), the exact call and the expected shapes are written out.

---

## How to use this document

1. Read `Architecture.md` §1–§6 fully before writing any code. §13 (gotchas) is worth reading twice.
2. Work the tasks **in order**. The ordering is not stylistic: T1.2 validates the metric that T6.1
   reports, and T4.3 is the gate that tells you whether a 13-hour training run is worth starting.
3. Tick each task by making its **Verify** command pass. Do not tick on "the code looks right".
4. If a Verify fails, consult `Architecture.md` §13 before debugging anything else. All sixteen
   most common failures are listed there, each with its exact error message and a one-line cause.

### Conventions inherited from this repo

| Rule | Where it comes from |
|---|---|
| Line length 88, `ruff format` clean | `backend/ruff.toml` |
| Imports sorted (isort rule `I` active) | `backend/ruff.toml` |
| Every dependency pinned with `==` | `backend/requirements.txt` |
| Tests: plain pytest functions, no classes, no `unittest` | `backend/tests/test_health.py` |
| Tests: arrange–act–assert with blank lines between phases | `backend/tests/test_health.py` |
| Tests must not need a database or a live lifespan | `backend/conftest.py:9` |
| New `pytest.mark.*` must be registered in `pyproject.toml` | `--strict-markers`, zero markers declared |
| Absolute imports rooted at `app.` | `backend/pyproject.toml` → `pythonpath = ["."]` |
| Run ML scripts as `python ml/<script>.py` from the repo root | `ml/_bootstrap.py`, see T3.6 |

### Critical path

```
P0 environment
  └── P1 metric  ──────────────────────────────┐
        └── P2 data ──► P3 model ──► P4 smoke ──► P5 train ──► P6 eval ──► P7 API ──► P9 integrate
                                            │                                                    │
                                            └──────────────► P8 clarification ──────────────────┘
                                                                         P10 docs/CI
```

P1 is first because the metric is the thing your write-up is judged on, it is pure Python, and it
costs 3 hours versus 3 days for the model. P4 is the gate that stops a broken model from consuming
a day of GPU time.

### Budget

| Phase | Hands-on | GPU wall clock |
|---|---:|---:|
| P0 Environment | 2 h | — |
| P1 Metric & post-processing | 3 h | — |
| P2 Data | 4 h | (1 h download, background) |
| P3 Model code | 6 h | 15 min |
| P4 Smoke + overfit gate | 4 h | 1 h |
| P5 Full training | 2 h | 9–13 h |
| P6 Evaluation & ablations | 8 h | 5 h |
| P7 Serving + API | 8 h | 30 min |
| P8 Clarification | 3 h | 1 h |
| P9 Integration & latency | 4 h | 15 min |
| P10 Docs, CI, hygiene | 3 h | — |
| **Total** | **~47 h** | **~21 h** |

---

## Phase 0 — Environment

### T0.1 — Decide your hardware tier

**Goal:** know which of the three configs (`smoke`, `dev`, `full`) you will actually run, before
downloading 19 GB.

**Blocked by:** none · **Time:** 15 min

1. Run `nvidia-smi`. Record the GPU name and total VRAM.
2. Cross-reference Architecture §8.3 and pick your tier:

   | VRAM | Tier | Practical consequence |
   |---|---|---|
   | ≥ 40 GB | `full.yaml` (Vicuna-7B) | The real result. Do this. |
   | 20–24 GB | `full.yaml` at micro 2 | ~40 h. Workable but slow. Consider a rented A100 |
   | 14–16 GB | `dev.yaml` (TinyLlama-1.1B) | Report honestly as a scaled-down reproduction (~55–62 %) |
   | CPU only | `dev.yaml` + patience | Not viable for real training. Rent an A100 (~$1.5/h) |

3. If you plan to rent, do it now — you will need it at T4.3 and T5.1.

**Verify:** you can state your tier and the number of hours T5.1 will take.
**Done when:** the decision is written in the top of your own notes. It constrains everything downstream.

---

### T0.2 — Build the Python 3.11 virtualenv

**Goal:** one venv at the repo root holding API + ML dependencies.

**Blocked by:** none · **Time:** 20 min (excluding download)

1. Check you have 3.11 available: `python3.11 --version`.
   If not, install it (`pyenv install 3.11.9`, or `apt install python3.11 python3.11-venv`, or
   `conda create -n asksight python=3.11`).
2. Delete or archive the old `backend/venv` (it is Python 3.14 and cannot hold these wheels). It is
   gitignored, so there is nothing to lose but reinstall time.
3. ```bash
   cd /path/to/AskSight
   python3.11 -m venv .venv
   source .venv/bin/activate
   python -m pip install -U pip setuptools wheel
   pip install -r backend/requirements.txt
   ```
4. Create `backend/requirements-ml.txt` exactly as in Architecture §12.3.
5. ```bash
   pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
   pip install -r backend/requirements-ml.txt
   pip freeze > backend/requirements-ml.lock.txt
   ```

**Verify**
```bash
source .venv/bin/activate && python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```
Expect `2.5.1 True <your GPU>`. If `False` on a GPU machine, stop and read Architecture §12.4.

```bash
python -c "import transformers, peft, bitsandbytes, datasets; print('ok')"
```

**Done when:** torch reports your GPU, and the four imports succeed.
**Common failure:** `RuntimeError: operator torchvision::nms does not exist` at first CUDA use →
torch and torchvision came from different indexes. Redo step 5 as a single command. (Gotcha #3.)

---

### T0.3 — Get Hugging Face access

**Goal:** no gated-repo 401 mid-training.

**Blocked by:** T0.2 · **Time:** 15 min

1. While logged into huggingface.co, accept the licence for **both** of:
   - `lmsys/vicuna-7b-v1.5`
   - `openai/clip-vit-large-patch14-336`
2. `pip install huggingface-hub` (already in `requirements-ml.txt`), then
   `huggingface-cli login` with a read token from https://huggingface.co/settings/tokens.
3. Pre-download everything while you have bandwidth:
   ```bash
   huggingface-cli download lmsys/vicuna-7b-v1.5
   huggingface-cli download openai/clip-vit-large-patch14-336
   huggingface-cli download TinyLlama/TinyLlama_v1.1
   huggingface-cli download openai/clip-vit-base-patch32
   ```
   That is ~27 GB. Vicuna-7B-v1.5 is 6 files of `.bin` *or* 2 of `.safetensors` — if the repo
   offers safetensors, `from_pretrained` will prefer them.

**Verify**
```bash
python - <<'PY'
from transformers import AutoModelForCausalLM, AutoTokenizer
tok = AutoTokenizer.from_pretrained("lmsys/vicuna-7b-v1.5")
print("vocab", len(tok), "hidden", tok.pad_token, tok.unk_token)
PY
```
Expect `vocab 32001` (32000 base + one added by the tokenizer's own config) and `hidden None
<unk>`.

**Done when:** all four models are in `~/.cache/huggingface/hub/` and the script above runs.
**If gated access fails:** switch every config to `TinyLlama/TinyLlama_v1.1` + `text_hidden_size:
2048`. Nothing downstream changes except the projector width.

---

### T0.4 — Repo hygiene before anything lands

**Goal:** never commit 300 MB adapters or 19 GB of images.

**Blocked by:** none · **Time:** 10 min

Append to the repo root `.gitignore` (merge, do not overwrite — the existing entries for
`node_modules`, `.env`, `__pycache__/`, `.pytest_cache/`, `reports/` must survive):

```
.venv/
data/
ml/runs/
ml/data/processed/
*.pt
*.safetensors
*.bin
.ipynb_checkpoints/
```

**Verify**
```bash
git status --porcelain --ignored | grep -E '\.pt$|data/' | head
git check-ignore -v data/vqa/raw/x.zip ml/runs/full/stage2/latest/adapter_model.safetensors
```
Expect both paths to be attributed to `.gitignore` entries.

**Done when:** `git status` is clean of large files.
**Do this first.** 320 MB of adapters in git history is unrecoverable and `git gc` will not save you.

---

## Phase 1 — Answer post-processing and the VQA accuracy metric

Pure Python. No torch, no GPU, no data. Runs in CI. This is the ground truth everything else is
measured against, so build it first and test it hard.

### T1.1 — Create the package layout

**Blocked by:** none · **Time:** 15 min

Create `backend/app/ml/__init__.py` (empty). Do **not** create `__init__.py` in
`backend/app/` or `backend/app/db/` — they are implicit namespace packages and adding one can break
the existing `from app.db.prisma import prisma` import.

**Verify**
```bash
cd backend && python -c "from app.ml.constants import IGNORE_INDEX, IMAGE_TOKEN; print(IMAGE_TOKEN, IGNORE_INDEX)"
```
**Done when:** no `ModuleNotFoundError`.

---

### T1.2 — Port the official VQA normaliser

**Goal:** `app/ml/answer_postprocess.py` with `normalize_answer` behaving identically to
`vqaEval.py`. Getting this wrong silently costs you points and you will not notice.

**Blocked by:** T1.1 · **Time:** 90 min

1. Create `backend/app/ml/constants.py`:
   ```python
   IMAGE_TOKEN = "<image>"
   IGNORE_INDEX = -100
   ```
2. Create `backend/app/ml/answer_postprocess.py` and paste §5.1, §5.2, §5.3 of
   `Architecture.md` verbatim. The only permitted import is `import re`.
3. Create `backend/tests/test_answer_postprocess.py` as a **parametrised-free, plain-function**
   test module matching the repo's conventions (no classes, no `unittest`, no new markers).

   ```python
   from app.ml.answer_postprocess import normalize_answer, strip_model_answer


   def test_lowercases_and_strips_trailing_period():
       assert normalize_answer("Yes.") == "yes"


   def test_strips_leading_articles():
       assert normalize_answer("A dog") == "dog"
       assert normalize_answer("The  Big  Dog.") == "big dog"


   def test_maps_number_words_zero_through_ten_only():
       assert normalize_answer("two") == "2"
       assert normalize_answer("Thirty") == "thirty"


   def test_expands_contractions():
       assert normalize_answer("Don't") == "don't"
       assert normalize_answer("DONT") == "don't"


   def test_collapses_whitespace_and_strips():
       assert normalize_answer("  Skateboard  ") == "skateboard"


   def test_preserves_decimal_points():
       assert normalize_answer("1.5") == "1.5"


   def test_deletes_punctuation_when_a_thousands_group_is_present():
       assert normalize_answer("1,000, and 2 more") == "1000 and 2 more"


   def test_replaces_punctuation_with_space_otherwise():
       assert normalize_answer("What is he doing?") == "what is he doing"


   def test_documented_hyphen_and_slash_quirks():
       assert normalize_answer("t-shirt") == "t shirt"
       assert normalize_answer("n/a") == "n"
   ```

   Write one test per bullet. Names state the behaviour, not the function — that is the house style
   in `tests/test_health.py`.

4. **Cross-check against the real thing.** Download `vqaEval.py` from
   https://github.com/GT-Vision-Lab/VQA, call its `processPunctuation`/`processDigitArticle` on the
   same 15 strings, and confirm byte-identical output. Do this in a scratch script, not a committed
   test. If anything differs, your port is wrong — fix the port, not the expectation.

**Verify**
```bash
cd backend && pytest tests/test_answer_postprocess.py -q
```
Expect `10 passed`.

```bash
cd backend && ruff check . && ruff format --check .
```

**Done when:** 10 tests pass, the 15 cases in Architecture §5.2.1 all match, and the module imports
only `re`.
**Watch for:** a "cleaner" implementation that strips articles before expanding contractions, or
that maps number words above ten. Both are wrong. (Architecture §5.2.)

---

### T1.3 — Implement `VQAScorer`

**Goal:** the official metric, computing over duplicates and capping at 1/3.

**Blocked by:** T1.2 · **Time:** 60 min

Add `class VQAScorer` to `answer_postprocess.py` (§5.3 of Architecture). Then create
`backend/tests/test_vqa_scorer.py`:

```python
def test_three_matching_human_answers_give_full_credit():
    scorer = VQAScorer()
    humans = ["down", "down", "at table", "skateboard", "down", "table", "down", "down", "down", "down"]
    assert scorer.add("down", humans) == 1.0


def test_no_match_scores_zero():
    scorer = VQAScorer()
    humans = ["net"] * 10
    assert scorer.add("lake", humans) == 0.0


def test_one_match_scores_one_third():
    scorer = VQAScorer()
    humans = ["lake", "net", "net", "net", "net", "net", "net", "net", "net", "net"]
    assert scorer.add("lake", humans) == pytest.approx(1 / 3)


def test_two_matches_score_two_thirds():
    scorer = VQAScorer()
    humans = ["net", "lake", "lake", "net", "water", "net", "net", "net", "net", "net"]
    assert scorer.add("lake", humans) == pytest.approx(2 / 3)


def test_counts_duplicates_rather_than_unique_answers():
    scorer = VQAScorer()
    humans = ["stop", "stop", "stop", "red", "red", "red", "sign", "sign", "sign", "sign"]
    assert scorer.add("stop", humans) == 1.0


def test_score_is_capped_at_one():
    scorer = VQAScorer()
    humans = ["yes"] * 10
    assert scorer.add("yes", humans) == 1.0


def test_scoring_is_invariant_to_casing_and_articles():
    scorer = VQAScorer()
    assert scorer.add("a Dog.", ["dog", "dog", "dog", "puppy", "cat", "pup", "hound", "dog", "dog", "puppy"]) == 1.0


def test_summary_averages_over_questions():
    scorer = VQAScorer()
    humans = ["yes", "yes", "yes", "no", "no", "no", "no", "no", "no", "no"]
    scorer.add("yes", humans, "yes/no")
    scorer.add("maybe", humans, "yes/no")
    assert scorer.summary()["accuracy"] == pytest.approx(0.5)


def test_summary_breaks_down_by_answer_type():
    scorer = VQAScorer()
    scorer.add("2", ["2"] * 10, "number")
    scorer.add("yes", ["yes"] * 10, "yes/no")
    summary = scorer.summary()
    assert set(summary["by_answer_type"]) == {"number", "yes/no"}
    assert summary["num_questions"] == 2
```

Add `def test_one_match_scores_one_third` as a genuine 1-of-3 case (already listed above):
`humans = ["lake", "net", "net", "net", "net", "net", "net", "net", "net", "net"]`,
prediction `"lake"` → 1/3.

**Verify**
```bash
cd backend && pytest tests/test_vqa_scorer.py -q
```
Expect all passed.

**Done when:** the scorer is the only metric in the project and
`from app.ml.answer_postprocess import VQAScorer` works from both `backend/tests/` and `ml/`.
**Watch for:** building the count from `set(human_answers)`. That caps repeated answers at one and
inflates your accuracy. (Architecture §5.3, point 1.)

---

### T1.4 — Compute the always-yes baseline

**Goal:** know the number your model must beat, measured rather than assumed.

**Blocked by:** T2.2 (needs the processed val split) · **Time:** 20 min

Do this task when T2.2 finishes. It is listed here because it belongs conceptually to Phase 1.

1. `ml/evaluate.py --baseline always_yes --val-jsonl data/vqa/processed/val.jsonl`
2. Same for `always_no` and `most_frequent_train` (argmax over **train** answers only).
3. Record the three numbers in a scratch results file. They go in your final report table.

**Verify:** `always_yes` accuracy is in the 0.24–0.26 band. If you get 1.00 your scorer is broken;
if you get 0.00 the normalisation is broken.
**Done when:** the three baseline numbers exist and are lower than any checkpoint you produce.

---

### T1.5 — Lock the pure-Python boundary

**Goal:** guarantee nothing torch-dependent creeps into `answer_postprocess.py` and breaks CI.

**Blocked by:** T1.3 · **Time:** 10 min

Add to `backend/tests/test_answer_postprocess.py`:

```python
def test_module_has_no_ml_dependencies():
    import app.ml.answer_postprocess as module
    source = Path(module.__file__).read_text()
    for banned in ("torch", "transformers", "numpy", "PIL"):
        assert banned not in source
```

**Verify:** `cd backend && pytest tests/test_answer_postprocess.py -q` passes.
**Done when:** the boundary is machine-enforced. This is what lets `ml/evaluate.py` and the API share
one implementation while CI installs only `requirements.txt`.

---

## Phase 2 — Data

### T2.1 — Download everything

**Goal:** 19 GB of COCO images plus the VQA v2 JSON.

**Blocked by:** none (run in the background while you do P1/P3) · **Time:** 1 h wall, hands-on 10 min

Run the exact command block in Architecture §6.1. Then check:

```bash
ls data/vqa/raw/*.json data/vqa/raw/*.zip | wc -l          # expect 10 (5 json + 5 zip)
find data/coco/train2014 -name '*.jpg' | wc -l            # expect 82783
find data/coco/val2014   -name '*.jpg' | wc -l            # expect 40504
python -c "import json;d=json.load(open('data/vqa/raw/v2_OpenEnded_mscoco_train2014_questions.json'));print(len(d['questions']))"   # 443757
```

**Verify:** all five counts match.
**Done when:** the counts print exactly those numbers.
**Watch for:** only extracting `train2014.zip`. VQA v2 `train` draws from both COCO 2014 splits; you
will silently lose a third of the data. (Gotcha #5.)

---

### T2.2 — Write `prepare_vqa_v2.py`

**Goal:** the six JSONL files in Architecture §6.2.

**Blocked by:** T2.1 · **Time:** 2 h

`ml/data/prepare_vqa_v2.py` with this public surface:

```python
def load_questions(path: Path) -> dict[int, dict]
def load_annotations(path: Path) -> dict[int, dict]
def resolve_image_path(image_id: int) -> str | None
def build_records(questions: dict, annotations: dict) -> list[dict]
def majority_answer(answers: list[str]) -> str
def sample_subset(records: list[dict], n: int, seed: int) -> list[dict]
def main() -> None
```

Implementation requirements:

1. Join questions to annotations on `question_id`, and to images on `image_id`. Never on list index.
2. `resolve_image_path`: VQA v2 `image_id` is a COCO id whose filename is zero-padded to 6 digits.
   Check **both** `train2014/COCO_train2014_{id:012d}.jpg` and
   `val2014/COCO_val2014_{id:012d}.jpg`; return whichever exists, relative to `data/coco/`.
   Return `None` if neither does and count the misses.
3. `majority_answer`: `collections.Counter(answers).most_common()` but with ties broken by
   first occurrence in the list. Implement by iterating and only replacing the leader on a strictly
   higher count.
4. Output rows exactly as in Architecture §6.2, including the full 10-element `answers` list.
5. Subsets use `random.Random(0).sample(records, n)` — **sample first, then slice**, and always from
   the already-built record list. Sampling after `--limit` truncation is a classic way to get an
   overfit gate that accidentally trains on the same 64 rows forever. (Gotcha #15.)

   Write these seven files, each sampled independently from its parent with seed 0:

   | File | Rows | Parent |
   |---|---:|---|
   | `train.jsonl` | 443,757 | all train records |
   | `train_smoke.jsonl` | 256 | train |
   | `overfit64.jsonl` | 64 | train, seed 0, used by the T4.3 gate |
   | `train_dev.jsonl` | 50,000 | train |
   | `val_smoke.jsonl` | 5,000 | val |
   | `val.jsonl` | 214,354 | all val records |
   | `test_dev2015.jsonl` | 107,394 | test-dev2015 questions |

6. `test_dev2015.jsonl` comes from `v2_Questions_Test_mscoco.zip`, file
   `v2_OpenEnded_mscoco_test-dev2015_questions.json`. It has **no answers**, so `answers` is `[]`,
   `answer` is `""`, and `answer_type` is `""`. Consumers must not try to score it.
7. Print a summary table (rows per file, how many images resolved from each COCO zip, how many
   missed) and `sys.exit(1)` if any file's row count is off by more than 0.1 % from
   Architecture §6.1.

```bash
python ml/data/prepare_vqa_v2.py \
  --vqa-raw data/vqa/raw --image-root data/coco --out data/vqa/processed
```

**Verify**
```bash
wc -l data/vqa/processed/*.jsonl
```
Expect `train.jsonl` = 443757, `val.jsonl` = 214354, `test_dev2015.jsonl` = 107394,
`train_dev.jsonl` = 50000, `val_smoke.jsonl` = 5000, `train_smoke.jsonl` = 256,
`overfit64.jsonl` = 64.

```bash
head -1 data/vqa/processed/train.jsonl | python -m json.tool
python - <<'PY'
import json
from pathlib import Path
missing = 0
with open("data/vqa/processed/train.jsonl") as fh:
    for i, line in enumerate(fh):
        if i % 500 == 0 and not (Path("data/coco") / json.loads(line)["image"]).exists():
            missing += 1
print("missing images:", missing)
PY
```
Expect `missing images: 0`.

**Done when:** all six files exist with the exact counts and no unresolvable image paths.

---

### T2.3 — `answer_vocab.py`

**Goal:** the top-N answer vocabulary, built from **train only**.

**Blocked by:** T2.2 · **Time:** 45 min

1. `build_vocab(train_jsonl, min_count=5)` → `Counter` of normalised answers, keep those with
   count ≥ 5. Expect roughly 20,000 classes; print the number and the top 30 with counts.
2. Save to `data/vqa/processed/answer_vocab.json` as `{"answers": [...], "min_count": 5, "built_from": "train.jsonl"}`.
3. `most_frequent()` returns the argmax. This is T1.4's third baseline.
4. `zero_shot_image_match(...)` (§5.4 baseline 4) using CLIP's text encoder. This is the ~60 %
   "no LLM at all" reference number. Implement it, but do not let it block Phase 3 — it is a
   baseline, not a dependency.

**Verify**
```bash
python ml/data/answer_vocab.py --train data/vqa/processed/train.jsonl \
  --out data/vqa/processed/answer_vocab.json --min-count 5
python -c "import json;v=json.load(open('data/vqa/processed/answer_vocab.json'));print(len(v['answers']), v['answers'][:5])"
```
Expect a size in the 18,000–22,000 range and `['2', '1', 'yes', 'no', ...]`-ish at the top.

**Done when:** the file exists and the top answers are sensible (`yes`, `no`, `2`, `1`, `white`,
`black`, `right`, `left`, `red`, `blue` are the usual VQA v2 head).
**Watch for:** building the vocabulary from `val.jsonl`. That is test-set leakage and every number
derived from it is invalid.

---

### T2.4 — `VQAv2Dataset`

**Goal:** the dataset class from Architecture §6.3.

**Blocked by:** T2.2, T3.2 (needs the processor), T3.5 · **Time:** 2 h

`ml/data/vqa_dataset.py`, implementing exactly the constructor signature in Architecture §6.3.

Requirements:

1. Load the JSONL fully into memory at construction (443,757 dicts ≈ 400 MB — fine, and far faster
   than re-reading the file per worker).
2. `__getitem__` returns `{"input_ids": LongTensor[T], "labels": LongTensor[T],
   "pixel_values": FloatTensor[3, 336, 336]}` where `T == num_image_tokens + ~40`. Vary `T` between
   samples — that is what the collator pads for.
3. Images: `Image.open(path).convert("RGB")`, then `self.image_processor(images=image,
   return_tensors="pt")["pixel_values"][0]`. Never hand-roll resize/normalise.
4. `answer_sampling="most_common"` uses `record["answer"]`. `"random"` picks
   `random.Random(seed + index + epoch_offset)`. Start with `most_common`; `"random"` is ablation A3.
5. Add `def set_epoch(self, epoch: int) -> None` so the `"random"` mode can vary per epoch when you
   build a multi-epoch sampler. Not needed for 1 epoch.
6. `limit` truncates after loading, for `val_smoke` style debugging.

**Verify**
```bash
python - <<'PY'
from transformers import CLIPImageProcessor
from ml.data.vqa_dataset import VQAv2Dataset
p = CLIPImageProcessor.from_pretrained("openai/clip-vit-large-patch14-336")
ds = VQAv2Dataset("data/vqa/processed/train_smoke.jsonl", "data/coco", tokenizer=None, num_image_tokens=576, image_processor=p)
print(len(ds))
PY
```
Expect `256`. Then, after T3.2 lands, assert
`ds[0]["pixel_values"].shape == (3, 336, 336)` and `ds[0]["input_ids"].shape == ds[0]["labels"].shape`.

**Done when:** the shape and length assertions hold and iterating 32 items produces no exception.
**Do not** implement feature caching. 576 × 1024 features for 443k images is ~354 GB. It does not
fit, and dataloader workers solve the problem. (Architecture §6.3.)

---

### T2.5 — The collator

**Goal:** right-padding with consistent masking.

**Blocked by:** T2.4 · **Time:** 45 min

`ml/data/collator.py` with `make_collator(tokenizer, pad_token_id, ignore_index=-100)`, exactly as
in Architecture §6.4. Return `input_ids`, `labels`, `attention_mask`, `pixel_values`, all stacked.
Take `pad_token_id` as a parameter — do not read `tokenizer.pad_token_id` inside, so tests can pass a
sentinel.

**Verify**
```bash
python - <<'PY'
import torch
from ml.data.collator import make_collator
pad, ign = 0, -100
c = make_collator(None, pad, ign)
out = c([{"input_ids": torch.arange(5), "labels": torch.arange(5),
          "pixel_values": torch.zeros(3, 4, 4)} for _ in range(3)])
out2 = c([{"input_ids": torch.arange(7), "labels": torch.arange(7),
           "pixel_values": torch.zeros(3, 4, 4)}])
print(out["input_ids"].shape, out["attention_mask"].sum(1), out["labels"][0])
print(out2["input_ids"].shape, out2["attention_mask"].sum(1), out2["labels"][0])
PY
```
Expect `torch.Size([3, 5])`, `tensor([5,5,5])`, `tensor([0,1,2,3,4])` and
`torch.Size([1, 7])`, `tensor([7])`, `tensor([0,1,2,3,4,5,6])`.

**Done when:** mixed-length batches pad correctly and every pad position is `-100` in `labels`
and `0` in `attention_mask`.

---

## Phase 3 — Model code

### T3.1 — `projector.py`

**Blocked by:** T0.2 · **Time:** 30 min

Copy Architecture §7.3 verbatim into `backend/app/ml/projector.py`.

**Verify**
```bash
cd backend && python -c "
import torch
from app.ml.projector import LlavaProjector
p = LlavaProjector(1024, 4096)
print(p(torch.zeros(2, 576, 1024)).shape, sum(x.numel() for x in p.parameters()))
"
```
Expect `torch.Size([2, 576, 4096]) 20979712`.

**Done when:** the parameter count is exactly 20,979,712.

---

### T3.2 — `build.py`: assemble the processor and tower

**Goal:** one function that builds a `CLIPProcessor` and a frozen vision tower from a name or a run
directory.

**Blocked by:** T3.1 · **Time:** 45 min

```python
def load_processor(source: str):
    """source is either an HF model id or a run_dir written by save_checkpoint()."""

def load_vision_tower(source: str, torch_dtype, device) -> CLIPVisionModelWithProjection
    # loads .vision_model only; requires_grad_(False); .eval()
```

1. Use `.vision_model` from `CLIPModel`, not `CLIPVisionModelWithProjection` — you want the
   pre-projection hidden states at width 1024, not the 768-wide projected embedding. Getting this
   wrong is a silent shape error that only appears when the projector rejects the input.
2. Set `torch_dtype` (bf16) and `.to(device)` here, once.
3. `load_processor` must accept either `openai/clip-vit-large-patch14-336` (training) or a
   `run_dir` (serving, via `CLIPProcessor.from_pretrained(run_dir)`). This is the train/serve skew
   guard from Architecture §2.1 and §10.1.

**Verify**
```bash
python - <<'PY'
import torch
from app.ml.build import load_processor, load_vision_tower
proc = load_processor("openai/clip-vit-large-patch14-336")
tower = load_vision_tower("openai/clip-vit-large-patch14-336", torch.bfloat16, "cpu")
px = proc(images="data/coco/train2014/COCO_train2014_000000262148.jpg", return_tensors="pt")["pixel_values"]
out = tower(pixel_values=px).last_hidden_state
print(px.shape, out.shape, all(not q.requires_grad for q in tower.parameters()))
PY
```
Expect `torch.Size([1, 3, 336, 336]) torch.Size([1, 577, 1024]) True`.

**Done when:** the shape is `[1, 577, 1024]` and no parameter requires grad.

---

### T3.3 — `model.py`: `LlavaForVQA`

**Goal:** the class and methods in Architecture §7.4.

**Blocked by:** T3.2, T4.1 (needs a real tokenizer to develop against) · **Time:** 3 h

Signature: `__init__(self, llm, projector, vision_tower, processor, num_image_tokens, prompt_template, answer_template, system_prompt)`.

Implement `encode_images`, `build_prompt_ids`, `forward`, `generate`, plus the module-level
`derive_num_image_tokens(vision_config)`.

Four things to get exactly right:

1. **`inputs_embeds[mask] = image_features.reshape(-1, text_hidden_size)`** with `clone()` first,
   and the `raise ValueError` on slot-count mismatch. That assertion is your tripwire for gotcha #1.
2. **`inputs_embeds = inputs_embeds.clone()` before the assignment.** `get_input_embeddings()`
   returns a view into the parameter; writing into it corrupts the embedding matrix.
3. `generate` returns `mean_logprob`. Compute it from `outputs.scores` as in Architecture §10.4 —
   `sequences_scores` is only populated for beam search, and you are using greedy.
4. `generate` truncates at `extract_answer`'s stop tokens, then calls `strip_model_answer`.

**Verify**
```bash
python - <<'PY'
import torch
from app.ml.projector import LlavaProjector
from app.ml.model import LlavaForVQA
import inspect
src = inspect.getsource(LlavaForVQA.forward)
assert "clone()" in src, "must clone inputs_embeds before masked assignment"
assert "raise ValueError" in src, "must assert image slot count"
print("structural guards present")
PY
```
Behavioural verification happens in T4.3 — at this point you are only confirming the code exists and
has the guards.

**Done when:** the module imports under torch and the two structural assertions hold.
**Watch for:** `apply_chat_template`. Do not use it. It is Llama-3-specific, it does not know about
`<image>`, and Vicuna-7B has no chat template.

---

### T3.4 — `config.py` and the three YAML configs

**Blocked by:** T3.3 · **Time:** 1.5 h

1. `app/ml/config.py`: a frozen dataclass + `from_yaml(path)` + `validate()` that raises on unknown
   or missing keys, and cross-checks the model/width pairing from Architecture §7.5.
2. Write `ml/configs/smoke.yaml`, `dev.yaml`, `full.yaml` covering every key in §7.5.

   | Key | smoke | dev | full |
   |---|---|---|---|
   | `llm_name` | `TinyLlama/TinyLlama_v1.1` | same | `lmsys/vicuna-7b-v1.5` |
   | `text_hidden_size` | 2048 | 2048 | 4096 |
   | `vision_name` | `openai/clip-vit-base-patch32` | same | `openai/clip-vit-large-patch14-336` |
   | `vision_hidden_size` | 768 | 768 | 1024 |
   | `num_image_tokens` (derived) | 1024 | 1024 | 576 |
   | `train.micro_batch_size` | 4 | 8 | 4 |
   | `train.grad_accum_steps` | 4 | 8 | 8 |
   | `train.max_steps` | 200 | 3,000 | 13,868 |
   | `torch_dtype` | `float32` (T4-safe) | `bfloat16` | `bfloat16` |

   `smoke` deliberately uses a different vision tower. If anything hardcoded 576, smoke breaks
   immediately. That is the point.

**Verify**
```bash
python - <<'PY'
from app.ml.config import from_yaml
for n in ("smoke", "dev", "full"):
    c = from_yaml(f"ml/configs/{n}.yaml")
    c.validate()
    print(n, c.llm_name.split("/")[-1], c.vision_name.split("/")[-1])
PY
```
Expect three lines and no exception. Then deliberately corrupt one key and confirm `validate()`
raises.

**Done when:** all three configs validate, and a deliberately broken config fails loudly.
**Watch for:** a config that "works" but pairs `vision_hidden_size: 1024` with ViT-B/32 (768). The
projector will raise an opaque shape error 2,000 steps into a run. `validate()` exists for this.

---

### T3.5 — Overfit-batch integration test

**Goal:** prove the full tensor path works before writing a training loop.

**Blocked by:** T3.3, T2.4, T2.5 · **Time:** 1.5 h

```bash
python - <<'PY'
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from app.ml.build import load_processor, load_vision_tower
from app.ml.model import LlavaForVQA, derive_num_image_tokens
from app.ml.projector import LlavaProjector
from app.ml.config import from_yaml
from ml.data.vqa_dataset import VQAv2Dataset
from ml.data.collator import make_collator

cfg = from_yaml("ml/configs/smoke.yaml")
tok = AutoTokenizer.from_pretrained(cfg.llm_name)
tok.add_tokens(["<image>"], special_tokens=True)
tok.pad_token = tok.unk_token
llm = AutoModelForCausalLM.from_pretrained(cfg.llm_name, torch_dtype=torch.float32)
llm.resize_token_embeddings(len(tok))
proc = load_processor(cfg.vision_name)
tower = load_vision_tower(cfg.vision_name, torch.float32, "cpu")
proj = LlavaProjector(cfg.vision_hidden_size, cfg.text_hidden_size)
n_it = derive_num_image_tokens(tower.config)
model = LlavaForVQA(llm, proj, tower, proc, n_it, cfg.prompt.prompt_template,
                    cfg.prompt.answer_template, cfg.prompt.system_prompt)
ds = VQAv2Dataset("data/vqa/processed/train_smoke.jsonl", "data/coco", tok, n_it,
                  cfg.data.max_seq_len, proc)
batch = make_collator(tok, tok.pad_token_id)([ds[i] for i in range(2)])
print("tokens", batch["input_ids"].shape, "pixels", batch["pixel_values"].shape,
      "n_image_tokens", n_it)
out = model(**batch)
print("loss", float(out["loss"]))
gen = model.generate(batch["input_ids"][:1], batch["attention_mask"][:1],
                     batch["pixel_values"][:1], max_new_tokens=10)
print("answer:", repr(gen["answer"]), "mean_logprob", gen["mean_logprob"])
PY
```

**Verify, in this order:**
1. `tokens` shows `[2, ~1060]` for smoke (1024 image tokens + ~36 text) and `pixels` `[2, 3, 224, 224]`.
   ViT-B/32 uses **224**, not 336. Both are correct for their tower.
2. `loss` is a finite float well under 10. On an untrained model expect 1.5–4.0.
3. `answer` is a short string, not empty and not 200 tokens.

**Done when:** a finite loss and a plausible generation. If `raise ValueError: expected N image
slots` fires, your token count and `num_image_tokens` disagree — gotcha #1, and you found it in
5 minutes instead of at hour 9.

---

### T3.6 — `ml/_bootstrap.py` and CI-safe imports

**Goal:** `ml/*.py` can `import app.*`.

**Blocked by:** none · **Time:** 15 min

Create `ml/_bootstrap.py` from Architecture §11.3. Every `ml/*.py` entry point begins with:

```python
import _bootstrap  # noqa: F401

from app.ml.config import from_yaml
```

`python ml/train.py` puts `ml/` on `sys.path[0]`, so this works with no installation. Record the
`python ml/train.py ...` (not `python -m ml.train`) convention in each script's module docstring.

**Verify**
```bash
python ml/data/answer_vocab.py --help
```
Expect usage text, not `ModuleNotFoundError: No module named 'app'`.

**Done when:** every `ml/` script runs from the repo root with no PYTHONPATH set.

---

## Phase 4 — Smoke training and the overfit gate

Nothing expensive happens until T4.3 passes.

### T4.1 — `ml/train.py` skeleton with argument parsing

**Blocked by:** T3.4, T3.5 · **Time:** 2 h

```python
def parse_args() -> argparse.Namespace
def set_seed(seed: int) -> None
def build_model(cfg, device) -> LlavaForVQA
def get_trainable_parameters(model, lr, projector_lr_multiplier=10.0) -> list[dict]
def build_optimizer(cfg, param_groups) -> torch.optim.Optimizer
def build_scheduler(cfg, optimizer, num_training_steps)
def build_dataloaders(cfg, tokenizer, num_image_tokens)
def save_checkpoint(run_dir, model, tokenizer, processor, cfg, step, optimizer, scheduler, step_count)
def load_checkpoint(run_dir, model, tokenizer, processor, optimizer, scheduler)
def train(cfg) -> None
```

Required CLI flags beyond `--config`: `--run-name`, `--max-steps`, `--eval-every`, `--save-every`,
`--train-jsonl`, `--val-jsonl`, `--resume`, `--stage {1,2}`.

`get_trainable_parameters` must return two groups and assert both are non-empty:

```python
def get_trainable_parameters(model, lr, projector_lr_multiplier=10.0):
    projector = [p for p in model.projector.parameters() if p.requires_grad]
    lora = [p for n, p in model.llm.named_parameters()
            if p.requires_grad and "lora" in n.lower()]
    assert projector, "projector must be trainable"
    assert lora, "no trainable LoRA params found - check stage and PEFT wiring"
    return [{"params": projector, "lr": lr * projector_lr_multiplier},
            {"params": lora, "lr": lr}]
```

Implement `train()` per Architecture §8.2: the nested micro-batch loop, `(loss / grad_accum).backward()`,
`clip_grad_norm_(trainable, 1.0)`, `optimizer.step()`, `scheduler.step()`, `optimizer.zero_grad()`.
Log every `log_every` steps: step, loss (running mean), both learning rates, tokens/s, `torch.cuda.
max_memory_allocated()/2**30`, ETA.

**Verify**
```bash
python ml/train.py --config ml/configs/smoke.yaml --run-name t41 --max-steps 5 --log-every 1
```
Expect 5 logged steps with a finite, roughly flat loss, a non-zero tokens/s, and a plausible GB
figure for the reported memory.

**Done when:** 5 steps run end-to-end and the log has all fields.

---

### T4.2 — `ml/evaluate.py` with greedy generation

**Goal:** the metric wired to the model.

**Blocked by:** T4.1, T1.3 · **Time:** 2 h

```python
def load_model(run_dir_or_config, device) -> tuple[LlavaForVQA, tokenizer, processor, cfg]
def evaluate(model, dataloader, scorer, max_new_tokens) -> dict
def run_baselines(val_jsonl, mode) -> dict
def main() -> None
```

1. Greedy only: `do_sample=False, num_beams=1`. No sampling, no temperature, no beam search — any of
   these makes the result irreproducible and none of them help on VQA v2.
2. `model.eval()` + `torch.inference_mode()` at entry; the caller restores `train()`.
3. Per question: generate → `extract_answer` → `strip_model_answer` → `scorer.add(raw_answer,
   record["answers"], record["answer_type"])`.
4. Time the generate call only (exclude data loading) and report p50/p95 ms and qps.
5. Write both `eval.json` (the Architecture §9.1 schema) and `predictions.jsonl`.
6. `--baseline {always_yes,always_no,most_frequent_train,zero_shot_clip}`.
7. `--submission-format` writes `[{"question_id": ..., "answer": ...}]` for EvalAI.

**Verify**
```bash
python ml/evaluate.py --config ml/configs/smoke.yaml --run-name t41 \
  --val-jsonl data/vqa/processed/val_smoke.jsonl --limit 200 \
  --out runs/t41/eval_smoke.json
python -c "import json;d=json.load(open('runs/t41/eval_smoke.json'));print(d['accuracy'],d['exact_match'],d['num_questions'])"
```
Expect `num_questions` = 200 and a finite accuracy. Then the baselines:

```bash
python ml/evaluate.py --baseline always_yes --val-jsonl data/vqa/processed/val_smoke.jsonl --out /tmp/by.json
```
Expect accuracy in the 0.23–0.27 band.

**Done when:** accuracy, exact_match, per-answer-type breakdown, latency percentiles and
`predictions.jsonl` all appear in the output JSON.
**Watch for:** forgetting to restore `model.train()`. If the model stays in `eval()` after the first
eval hook, subsequent training uses dropout-free LoRA and BatchNorm-free-but-still-wrong behaviour,
costing 2–3 points with no error message. (Gotcha #6, Architecture §8.2.)

---

### T4.3 — The overfit gate

**Goal:** prove the model can memorise 64 examples. **This gate decides whether T5.1 is worth
13 hours of GPU time.**

**Blocked by:** T4.1, T4.2 · **Time:** 30 min

1. `overfit64.jsonl` was already produced by T2.2 (64 rows, seed 0). Confirm it:
   `wc -l data/vqa/processed/overfit64.jsonl` → `64`.
2. ```bash
   python ml/train.py --config ml/configs/smoke.yaml --run-name overfit64 \
     --train-jsonl data/vqa/processed/overfit64.jsonl \
     --val-jsonl   data/vqa/processed/overfit64.jsonl \
     --stage 2 --max-steps 200 --eval-every 200 --log-every 25
   ```
3. Read the final training loss and the eval accuracy on those same 64.

**Verify**
- Training loss < 0.05
- Eval accuracy on those 64 = 1.00

**Done when:** both hold.

**If loss plateaus above ~1.5, work down this list in order** — it is the same ordering as
Architecture §13:

1. Image tokens not spliced into the embedding stream — is `encode_images` actually called in
   `forward`? Print `inputs_embeds[mask]` norm; if it equals the projector input norm, you
   reassigned nothing.
2. `labels` desynchronised from `input_ids` — assert
   `len(labels) == len(input_ids)` inside `forward` and print it.
3. `IGNORE_INDEX` is not `-100`.
4. `pad_token_id` is wrong, so masking is on the wrong token.
5. Projector output width ≠ `llm.config.hidden_size`.

Add the print/assert, fix, re-run. Do not proceed to T5.1 until this gate passes.

---

### T4.4 — Validate the loss actually decreases on real data

**Blocked by:** T4.3 · **Time:** 1 h GPU

```bash
python ml/train.py --config ml/configs/dev.yaml --run-name t44 \
  --train-jsonl data/vqa/processed/train_dev.jsonl \
  --val-jsonl data/vqa/processed/val_smoke.jsonl \
  --stage 1 --max-steps 2000 --eval-every 500
```

**Verify:** loss at step 2000 is clearly below loss at step 100, and val accuracy is already above
the always-yes baseline by a wide margin.
**Done when:** stage-1 warmup produces a model that beats the baseline.
**If loss is flat at ~1.5**: the stage-1 path is not actually freezing the LLM. `requires_grad_(False)`
alone is not enough — you also need `torch.no_grad()` around the LLM forward so the 4-bit base
weights contribute no graph, otherwise you silently train all 6.7 B parameters and OOM or diverge.

---

### T4.5 — Stage 2 checkpoint save/load round-trip

**Blocked by:** T4.1 · **Time:** 1 h

1. Save: adapter via `model.llm.save_pretrained(run_dir/"adapter")`, projector via
   `torch.save(projector.state_dict(), run_dir/"projector.pt")`, `processor.save_pretrained(run_dir)`,
   `config.to_yaml(run_dir/"config.yaml")`, plus optimizer/scheduler/RNG state for `--resume`.
2. Load into a fresh process and compare against the in-memory model's logits on one fixed batch.
   This is the check that catches "you are restoring the adapter but not the projector", which
   otherwise shows up much later as mysteriously mediocre accuracy after a resume.

**Verify**
```bash
python ml/train.py --config ml/configs/smoke.yaml --run-name t41 \
  --train-jsonl data/vqa/processed/train_smoke.jsonl \
  --val-jsonl data/vqa/processed/train_smoke.jsonl --max-steps 3 --save-every 3

python - <<'PY'
import torch
from app.ml.config import from_yaml
from ml.train import load_checkpoint, build_model          # the real functions
from ml.data.vqa_dataset import VQAv2Dataset
from ml.data.collator import make_collator
from transformers import AutoTokenizer

cfg = from_yaml("ml/configs/smoke.yaml")
tok = AutoTokenizer.from_pretrained(cfg.llm_name)
tok.add_tokens(["<image>"], special_tokens=True)
tok.pad_token = tok.unk_token

live = build_model(cfg, device="cpu")                      # freshly constructed, untrained
info = load_checkpoint("runs/t41", live, tok, cfg)         # loads adapter + projector + processor
live.eval()

ds = VQAv2Dataset("data/vqa/processed/train_smoke.jsonl", "data/coco", tok,
                  live.num_image_tokens, cfg.data.max_seq_len, live.processor)
batch = make_collator(tok, tok.pad_token_id)([ds[0]])
with torch.no_grad():
    before = live.forward(**batch)["logits"]

reloaded = build_model(cfg, device="cpu")
load_checkpoint("runs/t41", reloaded, tok, cfg)
reloaded.eval()
with torch.no_grad():
    after = reloaded.forward(**batch)["logits"]

delta = (before - after).abs().max().item()
print("resumed step:", info.get("step"), "| max logit delta:", delta)
assert delta < 1e-3, "checkpoint round-trip is lossy"
print("round-trip ok")
PY
```

Expect `resumed step: 3 | max logit delta: 0.0` (bf16/fp32 aside, a correct load is bit-identical
here because both sides are the same seed and the same weights).

**Done when:** reload is bit-comparable and `--resume` restores optimiser + scheduler + step.
Half the value of checkpointing is a reproducible checkpoint; verify it now, not at hour 11.

---

## Phase 5 — Full training

### T5.1 — Launch the real run

**Blocked by:** T4.3, T4.4, T4.5, and a GPU that fits `full.yaml` per T0.1 · **Time:** 13 h wall

```bash
python ml/train.py --config ml/configs/full.yaml --run-name full \
  --stage 1 --max-steps 2000 --eval-every 1000
python ml/train.py --config ml/configs/full.yaml --run-name full \
  --stage 2 --resume runs/full/stage1/latest --max-steps 13868 --eval-every 2000
```

Run it under `tmux` or `screen`, not a bare terminal. Log to `runs/full/train.log`.

**Verify after ~200 steps** (the 200-step measurement from Architecture §8.3, do this before walking
away):
```bash
grep -E '^\[' runs/full/train.log | head -3
grep -E '^\[' runs/full/train.log | tail -3
```
Compute `13868 / steps_per_second` and confirm it lands inside your tier's band in §8.3. If it is
2× slower than predicted, **stop and fix the cause** — do not discover this at hour 11.

**Done when:** training completes and `runs/full/stage2/latest/` holds the adapter, projector,
processor and config.

**Watch for:** memory growth over hours (a leak in the eval hook). Check `max_memory_allocated` at
step 200 and step 5,000. Also watch the per-answer-type accuracy in the eval hook — if `number`
stays at ~0.4 while `yes/no` climbs to ~0.85, suspect the missing leading space in
`ANSWER_TEMPLATE` (gotcha #4). Fix it, restart, do not accept the number.

---

### T5.2 — Sanity-check generations by eye

**Blocked by:** T5.1 (or the first eval checkpoint at step 2,000) · **Time:** 30 min

```bash
python - <<'PY'
import json
rows = [json.loads(l) for l in open("runs/full/stage2/latest/predictions.jsonl")][:30]
for r in rows:
    print(f"{r['score']:.2f}  Q: {r['question'][:60]:60}  raw={r['raw'][:40]!r}  -> {r['answer']!r}")
PY
```

**Verify:** answers are short phrases or yes/no. You should not see `ASSISTANT:`, a second `USER:`, a
full sentence, or an empty string in 30 samples. Each of those is a distinct bug.
**Done when:** you have looked at 30 outputs and can explain every weird one.
**This takes 30 minutes and has caught more real bugs than any automated check.** Do not skip it.

---

## Phase 6 — Evaluation, baselines, ablations

### T6.1 — Full-val evaluation

**Blocked by:** T5.1 · **Time:** 1.5 h GPU

```bash
python ml/evaluate.py --run-dir runs/full/stage2/latest \
  --val-jsonl data/vqa/processed/val.jsonl --image-root data/coco \
  --batch-size 16 --out runs/full/eval_val.json
```

**Verify**
```bash
python -c "import json;d=json.load(open('runs/full/eval_val.json'));print(d['num_questions'],round(d['accuracy'],4),round(d['exact_match'],4));print(json.dumps(d['by_answer_type'],indent=2))"
```
- `num_questions` == 214354
- `accuracy` ≥ 0.68 (the §1.3 threshold) or you have a bug to find, not a result to report
- all three answer types present

**Done when:** the headline number exists with a 95 % CI (`±1.96·sqrt(acc(1-acc)/214354)` ≈ ±0.002).

---

### T6.2 — All four baselines on the same split

**Blocked by:** T1.4, T6.1 · **Time:** 45 min (mostly `zero_shot_clip`)

```bash
for b in always_yes always_no most_frequent_train zero_shot_clip; do
  python ml/evaluate.py --baseline "$b" --val-jsonl data/vqa/processed/val.jsonl \
    --out "runs/full/baseline_$b.json"
done
```

**Verify:** `always_yes` ≈ 0.25, `zero_shot_clip` ≈ 0.55–0.62, your model > 0.68.
**Done when:** a single comparison table exists. If `zero_shot_clip` comes back at 0.10 you inverted
a similarity sign — check `argmax` over cosine similarity, not distance.

---

### T6.3 — test-dev2015 prediction and EvalAI submission

**Blocked by:** T6.1 · **Time:** 30 min + human queue

```bash
python ml/evaluate.py --run-dir runs/full/stage2/latest \
  --val-jsonl data/vqa/processed/test_dev2015.jsonl --image-root data/coco \
  --out runs/full/pred_testdev2015.json --submission-format
python -c "
import json;d=json.load(open('runs/full/pred_testdev2015.json'))
print(len(d), sorted(d[0].keys()))
assert all(set(r)=={'question_id','answer'} and isinstance(r['answer'],str) and r['answer'] for r in d)
print('submission format ok')"
```
Expect `107394 ['answer', 'question_id']` and `submission format ok`.

Upload at https://evalai.cloudcv.org/ → VQA challenge → test-dev2015.

**Verify:** EvalAI returns a score. Compare to your val accuracy.
**Done when:** you have the leaderboard number recorded.
**If EvalAI disagrees with your offline number by > 0.3 points:** your `normalize_answer` has drifted
from `vqaEval.py`. Diff your function against Architecture §5.2 character by character. This is the
one failure mode where being wrong is invisible locally, so treat any gap as a bug until proven
otherwise.

---

### T6.4 — The ablation table

**Blocked by:** T6.1 · **Time:** 6 h GPU

Run A1–A6 from Architecture §9.4 on `train_dev` (50k) + `val_smoke` (5k). Each is a `full.yaml`
variant with one changed flag. A1 skips stage 1. A6 changes the vision tower, which also changes
`vision_hidden_size` and the derived token count.

**Verify:** every row has an accuracy, a delta vs. the dev-config row, and a git commit hash for the
config change.
**Done when:** the table is complete.
**Read it honestly.** If A1 shows no difference, two-stage training is unnecessary and you should say
so rather than keeping it because the reference paper does it. If every ablation is within ±0.5,
your `val_smoke` sample is too small — redo on full `val` before concluding anything (Architecture
§9.2: 5,000 questions gives ±1.3 points, so you cannot resolve 0.5).

---

### T6.5 — Error analysis

**Blocked by:** T6.1 · **Time:** 1 h

Follow Architecture §9.5. Sample 100 predictions with `score < 0.5`, classify each into the five
categories, produce a bar chart of shares.

**Verify:** the categories are mutually exclusive and sum to 100.
**Done when:** you can say, with a number, what your model's dominant failure mode is. "Ambiguous
question / human disagreement at 35 %" is a better finding for a portfolio than a spurious 1-point
gain.

---

## Phase 7 — Serving and the `/ask` API

### T7.1 — `requirements.txt` additions and `VQAService`

**Blocked by:** T5.5 (a good checkpoint exists) · **Time:** 2 h

1. `backend/requirements.txt`: add `python-multipart==0.0.20` and `pillow==11.0.0`, pinned, sorted
   into the existing alphabetical grouping. Nothing else. Torch stays in `requirements-ml.txt`.
2. `backend/app/services/vqa_service.py` with the `VQAService` class from Architecture §10.1.
3. `run_dir` from env var `ASKSIGHT_RUN_DIR`, default `ml/runs/full/stage2/latest`.

Requirements:
- Lazy singleton with a module-level `_service`. Loading takes ~30 s; per-request loading is a 30 s p50.
- `load()` wrapped in `try/except` storing `load_error`. Failure must not kill the process.
- `CLIPProcessor.from_pretrained(run_dir)` — not the model name.
- `torch.inference_mode()` in `answer()`.
- Thread-safety: guard `answer()` with a `threading.Lock`. Greedy generation writes into the model's
  KV cache; two concurrent requests on one model instance corrupt each other. If you later move to
  continuous batching this goes away, but for this project a lock is correct and simple.

**Verify**
```bash
cd backend && python -c "
from app.services.vqa_service import VQAService
from pathlib import Path
s = VQAService(Path('../ml/runs/full/stage2/latest'))
s.load(); print('ready', s.is_ready, s.load_error)
img = open('../data/coco/val2014/COCO_val2014_000000000042.jpg','rb').read()
print(s.answer(img, 'what is on the table'))
"
```
Expect `ready True None` and a short answer.
**Verify the failure path too:** point `ASKSIGHT_RUN_DIR` at a nonexistent path and confirm
`load_error` is populated and `is_ready` is `False` — the app must still boot.

**Done when:** a model loads, answers, and a bad path degrades gracefully instead of crashing.

---

### T7.2 — `/ask` schemas

**Blocked by:** T7.1 · **Time:** 45 min

`backend/app/schemas/ask.py`:

```python
class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=512)

class AskResponse(BaseModel):
    question_id: str
    question: str
    answer: str
    spoken_text: str
    needs_clarification: bool
    clarification_prompt: str | None
    confidence: float
    latency_ms: int
```

**Verify:** `cd backend && python -c "from app.schemas.ask import AskRequest; print(AskRequest(question='x'))"`
**Done when:** both import and validate the obvious bad inputs.

---

### T7.3 — The endpoint

**Blocked by:** T7.2 · **Time:** 2 h

`backend/app/api/ask.py` with a `POST /ask` router. Multipart: `file: UploadFile`, `question: str`.
Validation per Architecture §10.2 in this exact order, so cheap rejections happen first:

1. content type not in the allow-list → **415**
2. read bytes; size > 10 MB → **413**
3. `Image.open(BytesIO(bytes)).verify()`, then reopen and read `.size` → **400** on any failure
4. width or height outside [32, 4000] → **400**
5. `question.strip()` empty or > 512 chars → **422**

Then call the service, build `spoken_text` from the table in Architecture §10.3, and return
`AskResponse` with the 200 schema.

Attach the router in `backend/app/main.py` via `app.include_router(ask.router)`. Keep the existing
`/health` and the existing `lifespan` untouched — `tests/test_health.py` must keep passing.

**Verify**
```bash
cd backend && python -c "from app.main import app; print([r.path for r in app.routes])"
```
Expect `['/openapi.json', '/docs', '/redoc', '/health', '/ask']`.

**Done when:** `/ask` appears in the route table and OpenAPI.
**Watch for:** `python-multipart` missing. FastAPI raises `RuntimeError: Form data requires
"python-multipart"` at import time, not at request time, so it looks like an app bug.

---

### T7.4 — Prisma migration for `QueryLog`

**Blocked by:** T7.2 · **Time:** 1 h

The current `QueryLog` has an `Int @id @default(autoincrement())` and **there are zero migrations** —
`backend/prisma/` contains only `schema.prisma`, so the table has never been pushed and the remote
NeonDB state is unknown. Do not assume it matches the schema file.

1. First, inspect: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma` won't help; instead
   `npx prisma db pull --print` against the real `DATABASE_URL` and compare to the file.
2. Change the model per Architecture §10.3: `id String @id @default(uuid())`, add
   `questionId String?`, `needsClarification Boolean @default(false)`, `latencyMs Int?`.
3. ```bash
   cd backend
   npx prisma migrate dev --name add_question_log_fields
   npx prisma generate
   ```
4. Write `app/services/query_log.py` with `async def record(question, answer, ...) -> str` returning
   the UUID. **Wrap the write in `try/except` and log the failure — never let a DB error fail a
   user's question.** Losing a log row is acceptable; losing the answer is not.
5. Extend `conftest.py` with an override so tests need no DB:
   ```python
   app.dependency_overrides[record_query_log] = lambda: AsyncMock()
   ```

**Verify**
```bash
cd backend && pytest -q
npx prisma migrate status
```
**Done when:** migrations exist on disk and the test suite still passes with no `DATABASE_URL`.

---

### T7.5 — `tests/test_ask_api.py`

**Goal:** the endpoint covered with no model and no database.

**Blocked by:** T7.3, T7.4 · **Time:** 2 h

Add a `fake_service` fixture in `backend/conftest.py` returning a stub with `is_ready = True` and a
canned `answer()`, injected via `app.dependency_overrides`. Write at least:

| Test | Expect |
|---|---|
| valid image + question | 200, `answer == "two"`, `spoken_text` non-empty |
| `question` missing | 422 |
| `question` = `"   "` | 422 |
| `question` = 600 chars | 422 |
| `file` missing | 422 |
| `content_type="application/pdf"` | 415 |
| bytes are not a decodable image | 400 |
| a 16×16 PNG (below min dimension) | 400 |
| service not loaded | 503, body contains `load_error` |
| response includes `latency_ms` and a UUID-shaped `question_id` | pass |

Build the test image in-code with PIL (`Image.new("RGB", (64, 64), "white").save(buf, "PNG")`).
Do not commit a binary fixture.

**Verify**
```bash
cd backend && pytest -q
```
All green, including the original 3 tests in `test_health.py`, with no `DATABASE_URL` set.

**Done when:** the suite covers every row in Architecture §10.3 and passes DB-free.
**Watch for:** accidentally entering the `TestClient` context manager, which runs the lifespan and
calls `prisma.connect()`. `backend/conftest.py:9` explains why the fixture deliberately does not.

---

### T7.6 — `tests/test_projector.py`

**Blocked by:** T3.1 · **Time:** 30 min

```python
torch = pytest.importorskip("torch")
```

Cover: output shape, exact parameter count 20,979,712, the `layer_norm=True` variant's parameter
count, and `load_state_dict` round-trip.

**Verify:** `cd backend && pytest -q` — green, and green again in CI where torch is absent (skipped,
not failed).

---

## Phase 8 — Clarification fallback

### T8.1 — Compute and expose `mean_logprob`

**Blocked by:** T4.2 · **Time:** 1 h

Confirm `model.generate` returns `answer_token_ids` and `mean_logprob`, and that `mean_logprob` is
computed from `outputs.scores` exactly as in Architecture §10.4.

**Verify:** generate on a batch of 16 val questions and print `mean_logprob` next to each extracted
answer. Correct answers should cluster near 0.0 (log p ≈ −0.2 to −0.1 per token); wrong or hedged
answers should be clearly more negative. If the two populations overlap completely, logprob is not a
usable signal and you must switch to sampling-agreement (T8.2 fallback).
**Done when:** there is a visible separation. There must be — if not, the bug is that you are
including the prompt tokens in the average.

---

### T8.2 — Threshold rule and fixed clarification strings

**Blocked by:** T8.1 · **Time:** 1.5 h

1. Implement the three conditions in Architecture §10.4. Fixed strings, chosen by question intent
   (not generated by the model).
2. Include `len(answer) > max_answer_chars` and empty-answer checks — these are cheap and catch the
   worst degeneration cases.

**Verify**
```bash
python - <<'PY'
# unit-level: force mean_logprob below the threshold and assert the response
# carries needs_clarification=True and a non-empty clarification_prompt
PY
```
**Done when:** forcing each of the three conditions produces `needs_clarification: true`.

---

### T8.3 — Calibrate the threshold on data

**Blocked by:** T8.2, T6.1 · **Time:** 1.5 h

1. From `runs/full/eval_val.json` / `predictions.jsonl`, build `(mean_logprob, is_wrong)` pairs where
   `is_wrong = score < 0.5`.
2. Sweep `t` over `np.linspace(-2.0, 0.0, 201)`. For each: precision = P(answer wrong | triggered),
   recall = P(triggered | answer wrong).
3. Choose the `t` at ~90 % precision. Plot the curve.
4. Report the operating point: "at `t = −0.45` we flag 11 % of queries, 90 % of which are wrong; we
   catch 32 % of all wrong answers at a 10 % false-positive rate on correct answers."

**Verify:** a precision number exists and it is ≥ 0.85.
**Done when:** the threshold is a measured choice with a published operating point.
**Do not ship a guessed threshold.** It is one line of work and it is the difference between a
feature and a liability — an accessibility tool that asks for clarification when it does not need to
is worse than one that never does.

---

## Phase 9 — Integration, latency, UI wiring

### T9.1 — End-to-end smoke test

**Blocked by:** T7.5 · **Time:** 1 h

Start the server against a real checkpoint and hit it with a real image:

```bash
cd backend && ASKSIGHT_RUN_DIR=../ml/runs/full/stage2/latest uvicorn app.main:app --port 8000 &
curl -s -F "file=@../data/coco/val2014/COCO_val2014_000000000042.jpg" \
        -F "question=what is on the table" http://localhost:8000/ask | python -m json.tool
```

**Verify:** a 200 with a plausible answer and `latency_ms` in the hundreds, not tens of thousands.
**Done when:** it works from a cold `curl`, which is the only test that matters for a demo.

---

### T9.2 — Latency benchmark

**Blocked by:** T9.1 · **Time:** 1 h

200 sequential requests, batch 1, no concurrency, against the served model. Record p50/p95/p99 and
memory. Compare against the §10.5 budget table and attribute any overshoot to a specific stage.

**Verify:** p50 ≤ 900 ms (Architecture §1.3). Report p95 too — a good p50 with a bad p95 means the
KV cache is thrashing or the GPU is shared.
**Done when:** a measured number replaces the estimate in the README. This is the "Latency: target
< 3s model inference" line in the README, and you should be able to state the real figure with the
hardware named.

---

### T9.3 — Wire the Expo UI

**Blocked by:** T9.1 · **Time:** 2 h

Out of scope for the ML work; listed so it is not forgotten. Per `ui/AGENTS.md`: read
`package.json` for the Expo major version, fetch `https://docs.expo.dev/versions/v<major>.0.0/`,
never trust memory for Expo APIs.

1. `src/lib/api.ts`: `askQuestion(imageUri, question)` → `POST /ask` multipart, typed to
   `AskResponse`.
2. `src/lib/speech.ts`: Web Speech API `SpeechRecognition` for the question and `SpeechSynthesis` for
   `spoken_text`, with `spoken_text` (not the raw `answer`) going to TTS.
3. Wire into the existing Home screen. Keep TTS off by default with an explicit opt-in — unsolicited
   speech in a screen-reader app is hostile, not helpful.
4. Android emulator cannot reach `localhost` on the host. Use `http://10.0.2.2:8000`, or
   `adb reverse tcp:8000 tcp:8000`.
5. Run `npx expo lint` and `npx tsc --noEmit` per `ui/AGENTS.md`.

**Verify:** `cd ui && npx expo lint && npx tsc --noEmit` clean.
**Done when:** the app shows and speaks an answer on a real device.

---

## Phase 10 — Documentation, CI, hygiene

### T10.1 — Add the CI lint job for `ml/`

**Blocked by:** none · **Time:** 30 min

`.github/workflows/backend-ci.yml` has two jobs, both `working-directory: backend`. ML scripts are
outside it and therefore completely unlinted.

1. Add an `ml-lint` job: `working-directory: .`, install `ruff==0.16.9` only, run
   `ruff check ml/ && ruff format --check ml/`.
2. Add an `ml-test` job that runs `pytest backend/tests -q` with **no** `requirements-ml.txt` — this
   proves the `pytest.importorskip` guards work and that nothing torch-dependent leaked into the API
   import graph. It should pass with torch absent. That is the whole point.
3. Add a data-prep job running `python ml/data/prepare_vqa_v2.py --fixture` against a committed
   < 2 MB fixture in `backend/tests/fixtures/vqa/`, so data-prep breakage is caught without a 19 GB
   download.

**Verify:** all jobs green on a push. Then confirm the `ml-test` job genuinely has no torch by adding
`python -c "import torch"` as an expected-failure step.

**Done when:** `ml/` is linted and the torch-free guarantee is machine-enforced in CI.

---

### T10.2 — Update the README

**Blocked by:** T6.1, T6.2, T9.2 · **Time:** 1 h

The README currently claims things that are not true. Correct them:

- Line 5: the model **is** now implemented — replace the description with what you actually built,
  naming the exact checkpoints (e.g. `clip-vit-large-patch14-336` + `vicuna-7b-v1.5` + QLoRA r=64).
- Line 41–46: the tree says `frontend/`, `ui/`, and a `docker-compose.yml`. Reality is `ui/` and no
  compose file. Either write the compose file or fix the tree. Do not leave it aspirational.
- Line 44: `ml/` now exists — fill in its real contents.
- Line 54: replace "standard VQA accuracy metric" with your **measured** number and the split
  (val, 214,354 questions) and the 95 % CI.
- Line 56: replace the < 3 s target with your measured p50 from T9.2.
- Add a results table: your model vs. the four baselines vs. the published LLaVA-1.5-7B number.

**Verify:** every claim in the README is either true or marked as a target.
**Done when:** a reader could clone the repo and reproduce your headline number from what the README
says.

---

### T10.3 — Final gate

**Blocked by:** everything · **Time:** 1 h

```bash
cd backend && pytest -q && ruff check . && ruff format --check .
cd .. && ruff check ml/ && ruff format --check ml/
git status --porcelain
du -sh .git
```

Then confirm, against Architecture §1.3:

| Criterion | Required | Have it? |
|---|---|---|
| Full-val VQA accuracy ≥ 0.68 | yes | |
| Always-yes baseline measured and reported | yes | |
| p50 model inference ≤ 900 ms | yes | |
| `pytest` + `ruff` green in CI | yes | |
| `test_ask_api.py` covers all 10 rows of §10.3 | yes | |
| Ablation table has all 7 rows | yes | |
| EvalAI number recorded | yes | |
| `.git` under ~50 MB | yes | |

**Done when:** every row is checked, and the failing ones are either fixed or explicitly written
down as known gaps. Do not declare the project complete with an unchecked row.

---

## Quick reference — every command in this project

```bash
# environment
source .venv/bin/activate
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"

# data
python ml/data/prepare_vqa_v2.py --vqa-raw data/vqa/raw --image-root data/coco --out data/vqa/processed
python ml/data/answer_vocab.py --train data/vqa/processed/train.jsonl --out data/vqa/processed/answer_vocab.json

# the gate — run this before every long run
python ml/train.py --config ml/configs/smoke.yaml --run-name overfit64 \
  --train-jsonl data/vqa/processed/overfit64.jsonl --val-jsonl data/vqa/processed/overfit64.jsonl \
  --stage 2 --max-steps 200 --eval-every 200

# training
python ml/train.py --config ml/configs/full.yaml --run-name full --stage 1 --max-steps 2000
python ml/train.py --config ml/configs/full.yaml --run-name full --stage 2 \
  --resume runs/full/stage1/latest --max-steps 13868 --eval-every 2000

# evaluation
python ml/evaluate.py --baseline always_yes --val-jsonl data/vqa/processed/val.jsonl --out /tmp/by.json
python ml/evaluate.py --run-dir runs/full/stage2/latest --val-jsonl data/vqa/processed/val.jsonl --out runs/full/eval_val.json
python ml/evaluate.py --run-dir runs/full/stage2/latest --val-jsonl data/vqa/processed/test_dev2015.jsonl \
  --out runs/full/pred_testdev2015.json --submission-format

# serving
cd backend && ASKSIGHT_RUN_DIR=../ml/runs/full/stage2/latest uvicorn app.main:app --port 8000
curl -s -F "file=@../data/coco/val2014/COCO_val2014_000000000042.jpg" \
        -F "question=what is on the table" http://localhost:8000/ask

# gates
cd backend && pytest -q && ruff check . && ruff format --check .
cd .. && ruff check ml/ && ruff format --check ml/
```
