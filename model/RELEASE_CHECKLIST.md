# AskSight Model Release Checklist

Use this checklist for a candidate checkpoint before enabling it in the app.

## Artifact and provenance

- [ ] Checkpoint has `config.yaml`, `projector.safetensors`, `data_meta.json`,
  `metrics.json`, and `manifest.json`.
- [ ] Run `python -m asksight_model.verify --checkpoint <path> --strict` and
  retain the output with the release notes.
- [ ] Record the model version, system prompt version, confidence threshold,
  pinned backbone revisions, dataset fingerprints, code revision, and dirty
  flag.
- [ ] Confirm the source checkpoint is the intended candidate and not the
  development mock or an unreviewed smoke run.

## Quality and serving

- [ ] Evaluate the held-out VQA split and fixed AskSight question set; retain
  predictions and metrics, not only aggregate scores.
- [ ] Review descriptions for invented objects, colors, scene claims, and
  missed visible details. Review color and typo/noisy-question cases
  separately.
- [ ] Run robustness evaluation and confidence calibration on validation data.
  Set `confidence_threshold` from reviewed accuracy-versus-coverage results;
  do not use the placeholder default as a calibrated threshold.
- [ ] Confirm the release candidate's latency and memory on target serving
  hardware and test startup, readiness, queue timeout, history, and abstention.
- [ ] Confirm the service returns a short, grounded answer or an explicit
  unsure response when confidence is below the selected threshold.

## Release record

- [ ] Save the evaluation outputs under `evaluations/runs/<run_id>/` with the
  checkpoint version and git revision.
- [ ] Record known failure modes, remaining unverified checks, and the decision
  owner/date before enabling the checkpoint.
