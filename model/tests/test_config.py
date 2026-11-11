"""Config defaults (B2)."""

from asksight_model.config import DEFAULT_SYSTEM_PROMPT, ModelConfig, load_configs


def test_default_prompt_requires_english_and_short_answers():
    # The mobile TTS layer speaks English only, and VQA accuracy rewards a
    # bare answer over a sentence. Both break if this prompt drifts.
    prompt = DEFAULT_SYSTEM_PROMPT.lower()
    assert "english" in prompt
    assert "short phrase" in prompt


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
