"""Config defaults and validation (B2)."""

import pytest

from asksight_model.config import (
    DEFAULT_SYSTEM_PROMPT,
    MAX_NEW_TOKENS_LIMIT,
    ModelConfig,
    load_configs,
    validate_model_config,
)


def test_default_prompt_requires_english_and_clear_short_sentences():
    # The mobile TTS layer speaks English only; answers should be useful aloud.
    prompt = DEFAULT_SYSTEM_PROMPT.lower()
    assert "english" in prompt
    assert "short sentences" in prompt


def test_default_config_uses_the_default_prompt():
    assert ModelConfig().system_prompt == DEFAULT_SYSTEM_PROMPT


def test_configs_default_yaml_loads(tmp_path):
    path = tmp_path / "cfg.yaml"
    path.write_text("model:\n  version: v9\ntrain:\n  epochs: 3\n  seed: 7\n")
    model_config, train_config = load_configs(path)
    assert model_config.version == "v9"
    assert model_config.system_prompt == DEFAULT_SYSTEM_PROMPT
    assert train_config.epochs == 3
    assert train_config.seed == 7


def test_validate_accepts_default_and_local_unpinned_models(tmp_path):
    validate_model_config(ModelConfig())
    local = tmp_path / "local-model"
    local.mkdir()
    validate_model_config(
        ModelConfig(
            vision_model=str(local),
            vision_revision=None,
            lm_model=str(local),
            lm_revision=None,
        )
    )


def test_validate_rejects_unpinned_remote_backbone():
    with pytest.raises(ValueError, match="pinned revision"):
        validate_model_config(ModelConfig(lm_revision=None))


@pytest.mark.parametrize("tokens", [0, -1, MAX_NEW_TOKENS_LIMIT + 1])
def test_validate_rejects_out_of_bounds_generation(tokens):
    with pytest.raises(ValueError, match="max_new_tokens"):
        validate_model_config(ModelConfig(max_new_tokens=tokens))


def test_validate_rejects_empty_version_and_prompt():
    with pytest.raises(ValueError, match="version"):
        validate_model_config(ModelConfig(version="  "))
    with pytest.raises(ValueError, match="system_prompt"):
        validate_model_config(ModelConfig(system_prompt=""))


def test_validate_accepts_lora_settings():
    validate_model_config(ModelConfig(lora_rank=16, lora_alpha=32, lora_dropout=0.05))


@pytest.mark.parametrize(
    "overrides",
    [
        {"lora_rank": 0},
        {"lora_rank": 16, "lora_alpha": 0},
        {"lora_rank": 16, "lora_dropout": 1.0},
        {"lora_rank": 16, "lora_target_modules": []},
        {"lora_rank": 16, "lora_target_modules": [""]},
    ],
)
def test_validate_rejects_bad_lora_settings(overrides):
    with pytest.raises(ValueError, match="lora"):
        validate_model_config(ModelConfig(**overrides))
