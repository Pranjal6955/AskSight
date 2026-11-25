# Task: Improve model answer quality

## Problem

Some answers are too short or wrong. The app shows the answer text it receives;
the main issue is the model and its training.

The current model has a frozen image encoder, a frozen language model, and a
small connector that is trained from scratch. The connector has been trained
with a small set of image questions. Most training answers are short phrases,
so the model learns to give short replies. A longer prompt or a higher token
limit can allow a longer answer, but cannot teach the model to read an image
more accurately.

## Goal

Make answers useful and grounded in the image, while keeping direct answers
brief. Prove each change on fixed held-out examples before using its
checkpoint in the app.

## Suggested work

### 1. Set a reliable baseline

- Confirm that the app is using a real checkpoint, not the development mock.
- Record the checkpoint version, prompt, generation limit, and data version.
- Run the current evaluation and save the predictions, not just the accuracy
  number.
- Review wrong answers by type: object, color/count, scene description, and
  reading text.
- Keep a separate set of real AskSight questions. VQA benchmark accuracy alone
  does not measure every app use case.

### 2. Make training match serving

- Use the same system prompt and answer format when training and serving.
- Keep direct question answers concise. Add separate image-description
  examples for requests such as “describe this photo.”
- Do not expect a longer token limit to improve visual accuracy.

### 3. Improve the data before scaling training

- Train on a larger VQA set than the current 2,000-question subset.
- Add image-caption examples for image descriptions and examples from the kinds
  of photos people will ask AskSight about.
- Add a text-reading path or OCR examples for signs and labels. Small text can
  be lost when an image is reduced to 224 pixels.
- Keep training, validation, and test images separate. Use validation results
  to choose a checkpoint; reserve the test set for final comparisons.

### 4. Compare training methods

Run these as separate experiments on the same data splits and evaluation set:

1. Train the current connector with the larger, relevant data set.
2. Train the connector plus LoRA adapters on the language model. This lets the
   language model adapt to the image features without updating all its weights.
3. If both remain weak, compare a pretrained vision-language model that was
   already trained to connect images and text.

Changing the language model alone may not help: the image-to-language
connection also needs to work. Keep each candidate's prompt and processor
matched to its training setup.

### 5. Measure quality, not answer length

For every candidate, record:

- VQA accuracy on the held-out benchmark set.
- Correctness and image support on the AskSight question set.
- Whether direct answers are brief and descriptions are useful.
- Common wrong-answer types, including made-up details and missed text.
- Latency and memory on the intended serving hardware.

Do not select a model just because it produces longer answers or has lower
training loss. Set acceptable quality and serving limits before choosing the
release checkpoint.

## Done when

- The current model and at least one improved candidate have been compared on
  the same held-out data and AskSight question set.
- The chosen model meets the agreed quality, latency, and memory limits.
- Its prompt, data split, training settings, model versions, and evaluation
  results are saved with the checkpoint.
- Sample correct and incorrect answers and known limits are documented before
  the model is used as the release model.

## Current status

Code-side groundwork is in place; the GPU experiments and human review are not.

- `evaluations/asksight_v1.jsonl` (26 cases) was restored from the v0.3 saved
  predictions with its hash in `evaluations/asksight_v1.sha256`: 18 direct VQA
  questions with ten references each, plus 8 description prompts with fact
  rubrics. The images are held-out COCO validation images, so this is a
  reproducible proxy set, not a real-user photo set.
- `asksight_model.data --answer-style sentence` rewrites common VQA forms into
  complete sentences and keeps `short_answer` for scoring. The rewriter is
  rule-based; its output still needs the planned 100-sample manual check.
- `coco_captions --sentences-per-image 3` combines distinct captions into
  multi-sentence description targets. The notebook enables this and accepts an
  optional reviewed `EXTRA_EXAMPLES_FILE` for OCR/sign, unanswerable, and
  real-photo examples.
- `train.py --lora-rank 16` trains connector + LoRA and saves
  `adapter_config.json`/`adapter_model.safetensors` in the checkpoint and
  manifest. Serving loads the adapter when `config.yaml` records it.
- Evaluation now reports exact VQA accuracy, containment VQA accuracy for
  sentence answers, sentence rate, mean words, and a heuristic description
  fact recall. Prompt and token limit are read from the checkpoint and recorded
  in every run; service no longer substitutes a different prompt.
- The notebook is parameterised for A/B/C: short vs sentence targets, and
  connector-only vs LoRA, with the same split and evaluation set.

Still required before release:

- Spot-check rewritten targets and description captions (100+ samples).
- Run A/B/C on the GPU, then D/E if color/text remain weak; record latency and
  memory on the target serving hardware.
- Add a counter-intuitive color set, several hundred consented real photos,
  text-reading examples, and unanswerable examples.
- Complete the manual description review and a POPE-style hallucination run.
- Add fixed screenshots for the cow, dog/beach, and "describe" regressions.

`evaluate --questions-file` and `evaluate_vlm` save the question-set hash,
predictions, references/rubrics, prompt, model version, and serving
measurements. The candidate training and Qwen3-VL inference require an
Internet-enabled GPU runtime and have not been run here. The development
machine is CPU-only with about 2.7 GB available memory, which is not enough to
safely load either full model. Do not select a release checkpoint until those
runs finish and the description outputs have been reviewed against the fact
rubrics. Add a separate consented real-photo set before making product-quality
claims.
