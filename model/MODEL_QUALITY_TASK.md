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

Baseline workflow work has started: `evaluate --questions-file` now runs a
fixed, separately curated AskSight question set through the real local
checkpoint and saves predictions with a SHA-256 fingerprint of the question
set, prompt, generation limit, model version, and serving measurements. VQA
predictions also retain all ten reference answers and image IDs for review.
No curated AskSight set or improved candidate has been evaluated yet; this
workflow change does not establish release quality.

Next: curate and freeze the initial AskSight set, run the current real
checkpoint plus at least one candidate on both held-out sets, then review
wrong answers by type and record those findings here before choosing a release
checkpoint.

The training notebook now defaults to 20,000 VQA examples and documents a
50,000-example configuration. It also supports adding hand-reviewed custom
question/answer examples, including photo descriptions. The shared prompt
distinguishes brief direct answers from three-to-five-sentence description
requests, with a 128-token generation cap. No larger training run has been
completed yet, and VQA-only data is still not sufficient evidence for improved
description quality.
