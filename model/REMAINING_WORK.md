# Model Remaining Work

Only the work still outstanding is listed here. Completed work and current
metrics are recorded in [README.md](./README.md) and git history. The current
`v0.1-colab` checkpoint is trained on a 2,000-question subset and is not a
release-quality checkpoint.

## Decisions needed

- [ ] Confirm the product quality target and acceptable VQA accuracy.
- [ ] Confirm target inference hardware, concurrency, memory, cold-start, and
  latency limits.
- [ ] Decide the serving boundary: backend process, dedicated service, or
  external inference host.
- [ ] Confirm supported languages and the multilingual boundary: the model is
  English-only; state whether translation happens in Track A before or after
  inference.
- [ ] Define the policy for ambiguous or potentially incorrect answers.

## Training and checkpoint

- [ ] Run the documented full-data training command on the intended GPU
  hardware (Colab/Kaggle T4, or a rented GPU); record the provenance in
  `metrics.json`.
- [ ] Store the release checkpoint outside source control.
- [ ] Confirm the release checkpoint passes `verify --strict`, archive its
  hash/size, and complete every item in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).

## Evaluation and quality

- [ ] Run evaluation on the final held-out split with the standard VQA metric.
- [ ] Benchmark on the actual target serving hardware, not a development
  machine or a free Colab/Kaggle GPU.
- [ ] Evaluate representative product questions in addition to the VQA subset.
- [ ] Evaluate empty, malformed, overly long, ambiguous, and multilingual
  questions.
- [ ] Re-run robustness evaluation on the release checkpoint and record the
  accuracy drop for each condition.
- [ ] Compare candidate prompts/checkpoints on the same fixed evaluation split.
- [ ] Record the numeric release thresholds (accuracy, latency, memory, cold
  start, concurrency) in [README.md](./README.md) and this file.

## Serving and integration

- [ ] Package the required model dependencies separately from the lightweight
  backend environment where appropriate.
- [ ] If a dedicated inference service is chosen, implement the HTTP wrapper
  (`asksight_model.service_app`) and `model/Dockerfile`; both are referenced in
  `docs/deployment.md` but do not exist.
- [ ] Load-test `/ask` on the target host (concurrency, queue wait, 504 rate,
  memory); the 30-second timeout cancels waiting only — in-flight generation
  keeps running.
- [ ] Test restart behavior, missing checkpoints, unavailable devices, and
  out-of-memory failures on the target host.
- [ ] Verify that model and dataset credentials never appear in logs or client
  bundles.
- [ ] Update [README.md](./README.md) with the final checkpoint, target
  hardware, measured metrics, known limitations, and serving instructions.
- [ ] Update `docs/deployment.md` to match the code (it currently describes
  Dockerfiles and a `service_app` that do not exist).
