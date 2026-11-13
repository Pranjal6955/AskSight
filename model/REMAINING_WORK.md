# Model Remaining Work

This document tracks the work required to move the current LLaVA-style model
package from a working research implementation to a validated production
inference service.

## Current foundation

- CLIP ViT-B/32 is frozen and connected to frozen Qwen2.5-1.5B-Instruct through
  a trainable projection connector.
- VQA v2 preparation creates reproducible image-disjoint train, validation, and
  test splits.
- Training saves connector weights, configuration, metrics, split metadata, and
  an artifact manifest.
- Local and mock inference services share the backend-facing answer protocol.
- Evaluation reports VQA accuracy, latency, cold-start time, and memory.
- Robustness evaluation covers blur, dark, obstructed, and low-resolution images.
- Tiny-fixture tests avoid downloading full checkpoints in CI.
- The `v0.1-colab` checkpoint contains held-out evaluation and robustness metrics,
  but it is not yet a production quality or deployment guarantee.

## Progress (13 Nov 2026)

- Checkpoints include `manifest.json`; `python -m asksight_model.verify`
  validates required artifacts and hashes (`--strict` for release, `--write` to
  migrate an older trusted checkpoint).
- Training metrics record git revision/dirty state, Python and dependency
  versions, UTC timestamps, hardware, and the dataset metadata/fingerprints.
- `LocalInferenceService` validates the manifest, pinned revisions, and
  projector/config compatibility at startup, warms up before becoming ready,
  bounds generation, supports a queue timeout and bounded concurrency, and
  exposes request/latency/memory stats. It keeps the existing `model_version` +
  `answer()` contract.
- Tests cover invalid checkpoints, manifest tampering, config mismatches,
  generation limits, and queue timeouts (55 tests, no network). CI already runs
  lint/format/tests.
- `model/RELEASE_CHECKLIST.md` defines the release gate.

Still blocked on product decisions or target hardware: the production training
run, target-hardware benchmarks, representative/multilingual product-question
evaluation, and the final release checkpoint. Those items remain unchecked.

## Next actions

1. Product: confirm accuracy, latency, memory, cold-start, and concurrency
   thresholds, plus the serving boundary and language policy.
2. Train on the intended GPU hardware with the release dataset; record the
   provenance in `metrics.json`.
3. Evaluate the release checkpoint on the fixed held-out split, robustness
   conditions, representative product questions, and edge-case questions.
4. Generate/verify `manifest.json`, store the checkpoint outside source control,
   and record hashes in the release notes.
5. If a dedicated inference service is chosen, add backend readiness/metrics
   endpoints around `service.ready` and `service.stats()`; otherwise document the
   in-process resource cost.
6. Exercise restart, unavailable device, and OOM behavior on the target host,
   then update `README.md` with the final numbers and known limitations.

## Blocking decisions

- Confirm the product quality target and acceptable VQA accuracy.
- Confirm target inference hardware, concurrency, memory, and cold-start limits.
- Decide whether inference runs in the backend process or as a separate service.
- Confirm supported languages and whether multilingual behavior is required.
- Define the policy for ambiguous or potentially incorrect answers.

## Implementation checklist

### 1. Reproducible production training

- [ ] Run the documented full-data training command on the intended GPU
  hardware. _(v0.1-colab exists for the 2000-question subset; release run pending.)_
- [x] Record dataset version, split fingerprints, config, code revision,
  hardware, dependency versions, and random seeds.
- [x] Produce a versioned checkpoint with `projector.safetensors`, `config.yaml`,
  `data_meta.json`, and `metrics.json`; new runs also write `manifest.json`.
- [x] Keep the trained checkpoint outside source control unless repository
  storage is explicitly approved.
- [x] Document checkpoint retrieval and verification.

### 2. Evaluation and quality validation

- [ ] Run evaluation on the final held-out split with the standard VQA metric.
  _(v0.1-colab: 0.4246 on 263 test questions; release checkpoint pending.)_
- [x] Record accuracy, median latency, p95 latency, device, and model version.
- [ ] Benchmark on the actual target serving hardware, not only a development
  machine or Colab GPU.
- [ ] Evaluate representative product questions in addition to the VQA subset.
- [ ] Evaluate empty, malformed, overly long, ambiguous, and multilingual
  questions. _(Input validation is tested; model behavior needs a release
  checkpoint.)_
- [ ] Run robustness evaluation on the final checkpoint and record accuracy
  drops for each condition. _(v0.1-colab run exists; rerun on release checkpoint.)_
- [x] Define when the product should ask the user to verify an answer.
- [ ] Compare candidate prompts/checkpoints using the same fixed evaluation
  split.

### 3. Inference service hardening

- [x] Define and version the inference service protocol, including model
  version, answer text, and failure behavior.
- [x] Load the model once during service startup and fail clearly if the
  checkpoint is invalid or unavailable.
- [x] Add startup validation for checkpoint artifacts and pinned backbone
  revisions.
- [x] Add warm-up and readiness behavior so traffic is not accepted before the
  model is usable.
- [x] Add request timeouts, bounded generation, concurrency limits, and
  cancellation behavior. _(Queue wait is cancellable; in-flight generation is
  bounded by `max_new_tokens` and documented as not interruptible.)_
- [x] Measure memory usage and cold-start time.
- [x] Decide whether generation should be serialized or use a controlled worker
  pool. _(Serialized by default; `max_concurrency` opts into a bounded pool.)_
- [x] Keep confidence scores out of the API until a calibrated method is
  evaluated.

### 4. Deployment integration

- [ ] Choose the model-serving boundary: backend process, dedicated service, or
  external inference host. _(Current in-process boundary is documented; the
  decision is still open.)_
- [ ] Package the required model dependencies separately from the lightweight
  backend environment where appropriate. _(Documented; packaging not done.)_
- [x] Document GPU drivers, CUDA/PyTorch compatibility, model cache location,
  environment variables, and checkpoint mounting.
- [ ] Add model health/readiness and version reporting. _(Provided by
  `service.ready`/`service.stats()`; backend endpoints still pending.)_
- [ ] Add metrics for request count, failures, queue time, generation time,
  latency percentiles, and memory usage. _(Available via `service.stats()`;
  deployment scraping still pending.)_
- [ ] Test restart behavior, missing checkpoints, unavailable devices, and
  out-of-memory failures. _(Missing checkpoint, corrupt checkpoint, and
  unavailable CUDA are tested; restart/OOM are not.)_
- [ ] Verify that model and dataset credentials never appear in logs or client
  bundles.

### 5. Test and documentation completion

- [x] Keep unit and tiny-fixture service tests passing without network access.
- [x] Add tests for invalid checkpoints, incompatible configs, generation
  limits, and service timeouts.
- [x] Add a reproducible CI smoke command for model package tests. _(Existing
  CI lint/format/pytest job; no checkpoint downloads.)_
- [x] Add a release checklist requiring evaluation metrics before selecting a
  checkpoint for production.
- [ ] Update [README.md](./README.md) with the final checkpoint, target
  hardware, measured metrics, known limitations, and serving instructions.
  _(Serving/limitations and current metrics are documented; final checkpoint and
  target hardware are still open.)_

## Completion criteria

The model is ready for production integration when:

1. A versioned checkpoint is reproducibly created and verified.
2. Held-out accuracy and target-hardware latency meet the agreed product
   thresholds.
3. Robustness limitations and answer-verification guidance are documented.
4. Startup, readiness, timeout, concurrency, and failure behavior are tested.
5. The backend can use the service without downloading or loading weights per
   request.
