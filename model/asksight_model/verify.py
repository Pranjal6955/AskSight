"""Verify checkpoint artifacts against `manifest.json`.

Usage (from `model/`):
    python -m asksight_model.verify --checkpoint checkpoints/v0.1-colab --strict

An older checkpoint without a manifest can be migrated on a trusted local copy:
    python -m asksight_model.verify --checkpoint checkpoints/v0.1-colab --write
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import verify_checkpoint, write_manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify an AskSight checkpoint")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument(
        "--strict", action="store_true", help="fail when the checkpoint has no manifest"
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="(re)create manifest.json from the current files; only on a trusted copy",
    )
    args = parser.parse_args(argv)
    if args.write:
        manifest = write_manifest(args.checkpoint)
        print(f"{args.checkpoint}: wrote {len(manifest['files'])} hashes to manifest.json")
        return 0
    manifest = verify_checkpoint(args.checkpoint, require_manifest=args.strict)
    if manifest["files"]:
        print(f"{args.checkpoint}: ok ({len(manifest['files'])} files match the manifest)")
    else:
        print(f"{args.checkpoint}: ok (no manifest; artifact hashes were not checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
