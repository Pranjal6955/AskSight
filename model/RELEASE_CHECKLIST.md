# Model Release Checklist

Use this before selecting a checkpoint for production. A checkpoint without
recorded evaluation metrics is not releasable.

## 1. Decide the release thresholds

- [ ] Confirm the minimum held-out VQA accuracy for the product.
- [ ] Confirm target hardware, cold-start, memory, and p95 latency limits.
- [ ] Confirm concurrency (`max_concurrency`) and request queue timeout.
- [ ] Record the decisions in `README.md` and `REMAINING_WORK.md`.

## 2. Reproduce the training run

- [ ] Train from a clean commit on the intended GPU hardware.
- [ ] Confirm `metrics.json` records the expected code revision, `dirty: false`,
  dependency versions, hardware, seed, and `data_meta` split fingerprints.
- [ ] Keep `checkpoints/` and `data/` out of source control.
- [ ] Store the checkpoint in the approved artifact location.

## 3. Verify quality and robustness

- [ ] Run `evaluate` on the held-out `test` split and record accuracy,
  median/p95 latency, cold start, and memory.
- [ ] Run `robustness` on the same split and record each accuracy drop.
- [ ] Run representative product questions and empty, malformed, overly long,
  ambiguous, and multilingual questions.
- [ ] Compare any prompt or checkpoint candidate on the same fixed split.
- [ ] Confirm the measured values meet the thresholds from step 1.

## 4. Verify the artifacts

- [ ] `python -m asksight_model.verify --checkpoint <dir> --strict` passes.
- [ ] `projector.safetensors`, `config.yaml`, `data_meta.json`, `metrics.json`,
  and `manifest.json` are present.
- [ ] Backbone revisions in `config.yaml` are the pinned revisions.
- [ ] The checkpoint hash/size is recorded in the release notes.

## 5. Verify serving behavior

- [ ] The service loads once at startup and reports `ready: true`.
- [ ] Missing/corrupt checkpoint, projector mismatch, and unavailable CUDA fail
  clearly at startup.
- [ ] Queue timeout, invalid input, and generation-limit tests pass.
- [ ] One `/ask` smoke request succeeds on the target host.
- [ ] `service.stats()` shows requests, failures, timeouts, latency percentiles,
  cold start, and memory.
- [ ] Restart, missing checkpoint, unavailable device, and out-of-memory
  behavior have been exercised or explicitly accepted as untested.
- [ ] No model, dataset, or cloud credentials appear in logs or client bundles.

## 6. Publish the release record

- [ ] Update `README.md` with the final checkpoint version, target hardware,
  measured metrics, known limitations, and serving instructions.
- [ ] Add the checkpoint version to `docs/api-contracts.md` if the API response
  examples change.
- [ ] Mark completed items in `REMAINING_WORK.md`.
