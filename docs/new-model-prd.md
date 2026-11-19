# AskSight Accuracy-First Vision Model PRD

**Status:** Draft for implementation planning  
**Date:** 19 November 2026  
**Product:** AskSight image question answering for blind and low-vision users  
**Decision owner:** AskSight project owner

## 1. Executive summary

AskSight will build a new English-first visual question-answering model that gives correct, concise answers grounded in the submitted photo. The product priority is factual correctness: a short correct answer is better than a fluent answer with an invented detail. When the photo does not support an answer, the model should say so plainly and ask for a clearer photo when that would help.

The project will not train a vision-language model from random initialization. It will benchmark two open-weight candidates—Qwen3-VL-2B-Instruct and SmolVLM2-2.2B-Instruct—on the same AskSight tasks, select the better candidate, and adapt it with parameter-efficient fine-tuning (LoRA). Both model cards list Apache 2.0 licensing, but the exact checkpoint revision, implementation dependencies, and upstream license must be recorded and rechecked before each training run. Model-card benchmark scores are useful context, not proof of AskSight accuracy. [1][2]

Training will use public datasets, led by VizWiz-VQA because its photos and questions come from blind users and include poor-quality and unanswerable examples. A separately collected, consented AskSight set will be held out for final evaluation and usability review; it will not be used for training in this release. TextVQA will supply OCR-focused training/evaluation examples. [3][4]

The release gate is a gain of at least **5 percentage points** in factual answer correctness over the selected pretrained base model on the locked AskSight evaluation set, with a paired 95% confidence interval supporting a positive gain. There must also be no critical question category with a material regression. If the gate is missed, the model does not replace the current model.

## 2. Problem and users

### Problem

Blind and low-vision users need useful answers about objects, attributes, text, and scenes captured with a phone camera. Their questions may be spoken and their photos may be blurry, dark, poorly framed, or include private information. A model can sound confident while answering from common language patterns rather than the image. Those errors undermine the primary value of the product.

VizWiz research describes this real-world setting: users take their own photos, ask questions about them, and some questions cannot be answered because the image is unclear or unrelated. The dataset authors also identify personal information as a privacy concern. This is why AskSight will measure answerability and protect user images as product requirements, not treat them as afterthoughts. [3][5]

### Primary user and job

The primary user is an English-speaking blind or low-vision person using AskSight to ask a single question about a photo and receive a spoken answer. Example jobs:

- Identify an object or visible attribute: “What color is the shirt?”
- Count clearly visible objects: “How many cups are on the table?”
- Read visible text: “What does this sign say?”
- Ask about a state or action: “Is the door open?”
- Request a description: “Describe this photo.”
- Get help when the evidence is insufficient: “I can’t tell from this photo. Please try taking it again with the sign in focus.”

## 3. Goals and non-goals

### Goals

1. Improve factual correctness on real AskSight-style questions.
2. Answer from visible evidence, not common-sense or language priors.
3. Give the answer first in concise, natural English; provide longer descriptions only when requested.
4. Read text when it is legible and state when it is not.
5. Abstain appropriately for unanswerable questions and unusable photos without refusing clear, answerable questions.
6. Fine-tune and evaluate on free notebook GPU capacity, recording the actual hardware and runtime for reproducibility.
7. Preserve the current app’s `/ask` request and response contract and model-version traceability.

### Non-goals for the first release

- Training a foundation model or vision encoder from scratch.
- Multilingual answers; English is the first-release language.
- Video, multi-image reasoning, multi-turn visual memory, image generation, or voice-model replacement.
- Medical, legal, financial, navigation, or emergency advice; the model is not a certified safety device.
- Claiming that a benchmark score guarantees correctness on every user photo.

## 4. Product requirements

| ID | Requirement | Priority | Acceptance evidence |
|---|---|---:|---|
| R1 | Accept one image and one natural-language question and return an image-grounded answer. | P0 | API integration passes with supported image formats and a non-empty question. |
| R2 | Answer direct questions concisely, putting the requested fact first. | P0 | Human review confirms answers are direct and understandable; wording does not change the correctness score. |
| R3 | Mention only details supported by the image. | P0 | Factuality review and object-hallucination evaluation are reported; no unsupported specifics are added to improve fluency. |
| R4 | State when the question cannot be answered from the image; ask for a retake when blur, framing, or lighting is the reason. | P0 | Meets the abstention thresholds in Section 8 while preserving answerability accuracy. |
| R5 | Answer color, object, count, yes/no, action/state, and scene questions. | P0 | Reported by category on the locked evaluation set. |
| R6 | Read visible text when legible and avoid guessing unreadable characters. | P0 | TextVQA and AskSight text subset results plus human review. |
| R7 | Give a fuller description only when the user asks for one. | P1 | Description quality review covers subject, setting, and salient visible facts. |
| R8 | Record the producing model version with each answer while preserving the app contract. | P0 | `/ask` response and stored history identify the deployed model version. |
| R9 | Report generation latency and runtime memory on named hardware. | P0 | Evaluation report includes cold start, median, p95, memory, and hardware/software versions. |

### Answer behavior

- Direct question: one short sentence when that fully answers the question (for example, “The cup is blue.”).
- Description request: two to four short sentences, ordered by the main subject and the most relevant visible details.
- Unclear evidence: say what cannot be determined and why, then suggest one actionable retake if appropriate.
- No numeric confidence is returned unless a calibrated, separately validated method is implemented. Generated prose or token probability is not presented as confidence.
- Do not identify a person, infer sensitive attributes, or invent a brand, breed, location, text, or action from weak evidence.

## 5. Model and system approach

### Candidate selection

Run a zero-shot comparison of the following pinned checkpoints using the same processor settings, prompts, image inputs, and evaluation items:

1. `Qwen/Qwen3-VL-2B-Instruct`
2. `HuggingFaceTB/SmolVLM2-2.2B-Instruct`

Select the candidate with the strongest factual correctness on the AskSight development set, subject to the answerability and hallucination guardrails in Section 8. Break a tie by better OCR performance, then lower p95 latency and lower peak memory on the same available GPU. If either candidate cannot be loaded reproducibly with the available free notebook runtime, record the failure and choose the other only if it meets the same quality gate. Do not select based only on vendor-reported benchmark scores: benchmark sets and methods differ. SmolVLM2’s model card reports TextVQA and OCRBench scores, while Qwen3-VL documents its own multimodal benchmarks; these are not direct head-to-head measurements. [1][2]

### Fine-tuning

- Use supervised fine-tuning with LoRA through Hugging Face PEFT, keeping the selected base checkpoint frozen except for configured adapter parameters. PEFT is designed to train a small number of additional parameters rather than all base parameters. [6]
- Start with a short smoke run, then a reproducible subset run, before a full training run. Use gradient accumulation and checkpointing when needed; use quantized loading only if supported by the selected model and the available GPU stack.
- Train with the selected model’s official multimodal processor and chat format. Keep training preprocessing identical to serving preprocessing.
- Mix question types within training batches. Do not train sequential “description, then QA, then honesty” stages that risk forgetting earlier behavior.
- Save adapter, tokenizer/processor configuration, data fingerprints, exact model revision, dependency lock, run configuration, GPU details, training logs, and evaluation output for each candidate run.
- Keep decoding deterministic for release evaluation. Tune generation limits on the development split only.

### Serving and app integration

The model provider accepts the current image and question inputs and returns answer text plus a model version. Keep the public `/ask` request and response shapes unchanged. Load the model once per service process, warm it before readiness, and report failures without exposing image contents or internal stack traces. Store the model version with history, as the existing app contract requires. Do not add a confidence field to the API without a validated calibration design.

Latency is a reported secondary metric, not a reason to choose a clearly less accurate model in this first experiment. Before production deployment, use the measured results to set an operational serving limit and deployment hardware. Free notebook GPU training is not itself a production hosting plan.

## 6. Data plan and governance

### Training data

- **VizWiz-VQA train:** primary in-domain source for blind-user questions, ordinary camera photos, answer variation, and answerability. The official release lists 20,523 training pairs and 4,319 validation pairs, with hidden test annotations; the dataset is CC BY 4.0. Use the official training annotations for fitting and the validation split for development only. [3]
- **TextVQA train:** supplemental source for questions that depend on text in images. The dataset site lists CC BY 4.0 and notes that OCR tokens are imperfect; use the raw image-question-answer examples and the model’s native image processing rather than treating supplied OCR tokens as unquestionable truth. [4]
- Use only dataset portions whose image and annotation licenses permit the intended research and model-training use. Record dataset version, license, source URL, retrieval date, and counts in the run manifest.
- Deduplicate across training and evaluation using source image IDs, exact hashes, and perceptual hashes where feasible. Split by image, never by question alone.

### AskSight evaluation data

Collect a locked set of at least **500 consented image-question examples** from blind or low-vision adults, targeting at least 100 examples that are genuinely unanswerable or too unclear to answer. Include all P0 categories and varied image quality; label category and answerability. This set is evaluation-only for this release and must not be used to train adapters, tune prompts, or select decoding settings.

Two independent reviewers judge whether each answer is factually supported and whether an abstention was appropriate; disagreements are adjudicated. Recruit blind/low-vision participants separately for a small usability review of whether answers are understandable and useful when spoken. Keep usability ratings distinct from factual correctness.

### Privacy, consent, and retention

- Explain the purpose, collection, access, retention, and deletion process before collecting any participant image. Participation and each image must be optional.
- Do not place participant images, transcripts, or identifying metadata in Git, public dataset repositories, or third-party model APIs.
- Store the evaluation set in access-controlled private storage, strip unneeded metadata, and establish a deletion date in the collection protocol before collection starts.
- Do not use participant examples for training without obtaining separate, explicit training consent and revising this PRD.
- Review public datasets for private or sensitive content and follow the dataset maintainers’ filtering and usage instructions. VizWiz research specifically discusses privacy risks in photos from blind users. [5]

## 7. Evaluation design

### Evaluation cohorts

1. **Public benchmark suite:** VizWiz-VQA validation split for real-user VQA and answerability; TextVQA validation split for OCR; POPE for object-existence hallucinations. Use official metrics and document split/version details. POPE is a polling-based object hallucination benchmark; it supplements, but does not replace, free-form human review. [3][4][7]
2. **AskSight development set:** a fixed subset used for candidate and prompt selection. No final claims are made from this set.
3. **Locked AskSight test set:** the 500+ consented examples in Section 6, inaccessible to model developers during training and tuning except through the final evaluation runner.

### Metrics

- **Primary — factual correctness:** percentage of answerable locked AskSight examples whose answer is judged correct and supported by visible evidence. Score meaning, not sentence wording. Use paired bootstrap resampling by image for the 95% confidence interval of the difference between the selected base and fine-tuned checkpoint.
- **VQA benchmark accuracy:** official VizWiz soft-answer accuracy, reported alongside semantic human scoring for the AskSight set.
- **Answerability:** unanswerable recall (share of unanswerable examples correctly declined) and false-abstention rate (share of answerable examples incorrectly declined).
- **OCR:** TextVQA official score and human correctness on AskSight text examples, including exact transcription where the question asks for it.
- **Hallucination:** POPE accuracy/precision/recall/F1 plus the percentage of unsupported object or attribute claims in human-reviewed descriptions and answers.
- **Category guardrails:** object, color, count, yes/no, action/state, text, description, and poor-quality image performance. Report numerator, denominator, and uncertainty for each category.
- **Operations:** cold-start time, generation median and p95, peak GPU memory, failures, and throughput under single-request load on each named evaluation GPU.

### Go/no-go criteria

Ship only when all of the following are true:

1. Fine-tuned factual correctness on the locked AskSight test set improves by at least **5 percentage points** over its own selected pretrained base, and the paired 95% bootstrap confidence interval for the gain is entirely above zero.
2. No P0 category loses more than **5 percentage points** of factual accuracy versus that base on the locked set. Any category with fewer than 50 examples is reported as underpowered and cannot be used to claim a pass for that category.
3. Unanswerable recall is at least **80%**, while false-abstention rate on answerable examples is at most **10%**.
4. POPE F1 is not lower than the selected base, and human review finds no material increase in unsupported claims.
5. Model loads and answers through the existing `/ask` interface, preserves model-version reporting, and has no unresolved critical privacy, licensing, or accessibility issue.

If the 5-point gain or a guardrail is missed, do not replace the current production model. Report the failure by category, revise data or training, and evaluate a new version against the same locked set only after preserving the current results. Do not repeatedly tune against the locked set.

## 8. Release, monitoring, and rollback

- Release the new adapter as a versioned artifact, not an overwrite of an unversioned checkpoint. Preserve the exact base revision and adapter hash.
- Keep the existing API provider boundary and switch the configured model version only after the go/no-go review.
- Retain the previous deployable artifact until the new version has passed acceptance and a rollback path has been exercised. Model deletion is a post-acceptance cleanup task, not a prerequisite for training.
- Monitor request latency, error rate, model version, and user-reported answer corrections. Do not log raw images or full question/answer text for model monitoring by default.
- Re-evaluate any change to base revision, adapter, processor, image preprocessing, prompt, or decoding configuration as a distinct model version.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Model answers from familiar language patterns rather than pixels. | Use matched/counter-intuitive cases, category slices, and image-grounded human review. |
| Longer answers add unsupported claims. | Score factual claims separately from answer style; keep direct answers short. |
| Dataset leakage inflates benchmark scores. | Deduplicate images, split by image, pin data versions, and keep the consented set locked. |
| Free GPU runtime changes or fails mid-run. | Smoke-test early, save resumable checkpoints, record hardware, and use small staged runs. Do not assume free GPU availability is guaranteed. |
| Model abstains too often or guesses too often. | Measure both unanswerable recall and false-abstention rate; tune only on development data. |
| User images contain private information. | Explicit consent, private access-controlled storage, metadata minimization, deletion process, and no public upload. |
| Upstream license or library support changes. | Recheck licenses and model implementation support at the exact pinned revision before training and release. |

## 10. Implementation phases

1. **Evaluation and data readiness:** write data manifests, validate license/access conditions, define image-disjoint splits, prepare the development and locked evaluation runners, and recruit/consent evaluation participants.
2. **Candidate baseline:** run both pinned base models on the same development and public benchmark suite; choose the higher-quality candidate using the rule in Section 5.
3. **Training pilot:** run a smoke test and a small LoRA experiment on the selected base using the free notebook GPU; confirm loss, checkpoint save/resume, and inference compatibility.
4. **Training and tuning:** train on public training data, tune only on development data, save each run and preserve the locked evaluation set.
5. **Final evaluation and release review:** run the single locked evaluation, calculate the paired confidence interval and all guardrails, conduct human review, and approve or reject release.
6. **Integration and cleanup:** switch the model behind the existing API, verify model-version persistence and rollback, then remove superseded model code/artifacts only after the new version is accepted.

## 11. Research sources

1. Qwen, [Qwen3-VL-2B-Instruct model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct) and [Qwen3-VL technical report](https://arxiv.org/abs/2511.21631). The model card identifies the checkpoint and license; the report describes family capabilities and benchmark methodology.
2. Hugging Face, [SmolVLM2-2.2B-Instruct model card](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct). Lists Apache 2.0, model usage, and reported OCRBench/TextVQA results; these vendor-reported results are not directly comparable to Qwen’s.
3. VizWiz, [Visual Question Answering dataset page](https://vizwiz.org/tasks-and-datasets/vqa/) and Gurari et al., [VizWiz Grand Challenge: Answering Visual Questions from Blind People](https://www.cs.cmu.edu/~jbigham/pubs/pdfs/2018/vizwiz-dataset.pdf). Dataset page documents split sizes, hidden test annotations, answerability fields, and CC BY 4.0 license.
4. Singh et al., [TextVQA dataset and benchmark](https://textvqa.org/dataset/). The dataset page describes text-dependent visual QA, CC BY 4.0 data, and limitations in provided OCR tokens.
5. Gurari et al., VizWiz paper, privacy and filtering discussion in the [dataset paper](https://www.cs.cmu.edu/~jbigham/pubs/pdfs/2018/vizwiz-dataset.pdf).
6. Hugging Face, [Transformers PEFT documentation](https://huggingface.co/docs/transformers/peft). Describes parameter-efficient methods that train adapter parameters while leaving most pretrained weights fixed.
7. Li et al., [Evaluating Object Hallucination in Large Vision-Language Models (POPE)](https://aclanthology.org/2023.emnlp-main.20/). Introduces polling-based object-presence evaluation and motivates separate hallucination measurement.

---

**Decision record:** fine-tune an open VLM; English first; free notebook GPU; train on public datasets; use consented AskSight examples for evaluation only; require a 5-point accuracy gain with paired 95% confidence evidence; preserve the existing `/ask` contract; prioritize accuracy over latency while reporting latency as a secondary measure.
