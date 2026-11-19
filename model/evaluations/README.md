# AskSight fixed image evaluation

`asksight_v1.jsonl` is the initial 26-case evaluation set:

- 18 direct visual questions selected from held-out COCO VQA v2 examples. The
  ten human answers are kept as `references`, so these rows can use standard
  VQA accuracy.
- 8 image-description prompts with manually written `expected_facts`. Review
  these predictions against the facts; do not treat answer length as a score.

This is a reproducible proxy set, not a set of real AskSight user photos. The
images are from the COCO validation split and must be materialized locally by
the VQA data preparation command before evaluation. The descriptions and fact
rubrics were written after visual review of the images. Add a separate,
consented real-photo set before making product-quality claims.

Run the current checkpoint:

```bash
cd model
python -m asksight_model.evaluate \
  --checkpoint checkpoints/v0.2-20k \
  --questions-file evaluations/asksight_v1.jsonl
```

Run the pretrained vision-language comparison on a GPU:

```bash
cd model
python -m asksight_model.evaluate_vlm \
  --questions-file evaluations/asksight_v1.jsonl \
  --output evaluations/runs/qwen3-vl-2b-asksight-v1.jsonl
```

The first run needs Internet access to download the COCO captions annotation
archive and selected images. From `model/`, prepare the image-description
training set with:

```bash
python -m asksight_model.coco_captions \
  --data-dir data/vqa \
  --out data/asksight_coco_captions.jsonl \
  --num-images 2000 \
  --val-images 200 \
  --val-out data/asksight_coco_captions_val.jsonl \
  --seed 0
```

This yields about 10,000 training captions from 2,000 train2014 images and
about 1,000 validation captions from 200 separate images. The Colab/Kaggle
notebook merges them with 20,000 VQA examples for candidate
`v0.3-vqa20k-cap10k`; it uses the caption validation rows to track description
loss separately from held-out VQA test scoring.

## Existing baseline snapshot

`runs/v0.1-v0.2-asksight-v1.metrics.json` contains a small direct-question
comparison aligned from the checkpoints' saved predictions. On these 18
selected questions, `v0.1-colab` scored 40.7% and `v0.2-20k` scored 42.6% by
VQA accuracy. This is a narrow diagnostic slice, not a replacement for the
1,014-question held-out result. Description cases have not been run on either
checkpoint in this environment yet.
