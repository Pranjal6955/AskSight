"""Tiny local model fixtures: no network access, no full checkpoints (B7)."""

from __future__ import annotations

import json

import pytest
from PIL import Image
from tokenizers import Tokenizer, models, pre_tokenizers
from transformers import (
    CLIPImageProcessor,
    CLIPVisionConfig,
    CLIPVisionModel,
    GPT2Config,
    GPT2LMHeadModel,
    PreTrainedTokenizerFast,
)

from asksight_model.config import ModelConfig
from asksight_model.pipeline import AskSightModel

CHAT_TEMPLATE = (
    "{% for message in messages %}"
    "{{ message['role'] }}: {{ message['content'] }}\n"
    "{% endfor %}"
    "{% if add_generation_prompt %}assistant: {% endif %}"
)

VOCAB = {
    "<unk>": 0,
    "<pad>": 1,
    "<eos>": 2,
    "<s>": 3,
    "system:": 4,
    "user:": 5,
    "assistant:": 6,
    "what": 7,
    "color": 8,
    "is": 9,
    "the": 10,
    "cat": 11,
    "brown": 12,
    "how": 13,
    "many": 14,
    "flowers": 15,
    "two": 16,
    "yes": 17,
    "no": 18,
    "you": 19,
    "are": 20,
    "a": 21,
    "test.": 22,
    "?": 23,
    "!": 24,
}


def _build_tiny_tokenizer() -> PreTrainedTokenizerFast:
    backend = Tokenizer(models.WordLevel(vocab=VOCAB, unk_token="<unk>"))
    backend.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
    return PreTrainedTokenizerFast(
        tokenizer_object=backend,
        unk_token="<unk>",
        pad_token="<pad>",
        eos_token="<eos>",
        bos_token="<s>",
        chat_template=CHAT_TEMPLATE,
    )


@pytest.fixture(scope="session")
def tiny_paths(tmp_path_factory) -> dict:
    root = tmp_path_factory.mktemp("tiny-model")

    vision_dir = root / "vision"
    CLIPVisionModel(
        CLIPVisionConfig(
            hidden_size=32,
            intermediate_size=64,
            num_hidden_layers=2,
            num_attention_heads=2,
            image_size=32,
            patch_size=16,
        )
    ).save_pretrained(vision_dir)
    CLIPImageProcessor(
        size={"shortest_edge": 32}, crop_size={"height": 32, "width": 32}
    ).save_pretrained(vision_dir)

    # Tiny decoder-only LM typed as gpt2: AutoTokenizer then loads the generic
    # fast wrapper honoring our tokenizer.json. A qwen2-typed tiny model would
    # load Qwen2Tokenizer, which overrides the tokenizer.json pre-tokenizer.
    lm_dir = root / "lm"
    GPT2LMHeadModel(
        GPT2Config(
            vocab_size=128,
            n_embd=64,
            n_layer=2,
            n_head=4,
            n_positions=512,
            n_inner=128,
            eos_token_id=2,
            bos_token_id=3,
            pad_token_id=1,
        )
    ).save_pretrained(lm_dir)
    _build_tiny_tokenizer().save_pretrained(lm_dir)

    return {"root": root, "vision": vision_dir, "lm": lm_dir}


@pytest.fixture(scope="session")
def tiny_config(tiny_paths) -> ModelConfig:
    return ModelConfig(
        version="test-v1",
        vision_model=str(tiny_paths["vision"]),
        vision_revision=None,
        lm_model=str(tiny_paths["lm"]),
        lm_revision=None,
        connector_hidden=16,
        system_prompt="You are a test.",
        max_new_tokens=4,
    )


@pytest.fixture(scope="session")
def tiny_model(tiny_config) -> AskSightModel:
    model = AskSightModel(tiny_config, device="cpu", dtype="float32")
    model.eval()
    return model


@pytest.fixture
def tiny_images() -> list[Image.Image]:
    return [Image.new("RGB", (48, 40), (200, 30, 30)), Image.new("RGB", (40, 48), (30, 30, 200))]


@pytest.fixture
def tiny_questions() -> list[str]:
    return ["what color is the cat", "how many flowers are you two"]


@pytest.fixture
def tiny_records(tmp_path) -> tuple:
    """A tiny on-disk dataset with two images per split region."""
    data_dir = tmp_path / "vqa"
    images_dir = data_dir / "images" / "tiny"
    images_dir.mkdir(parents=True)
    for index in range(4):
        Image.new("RGB", (48, 48), (index * 50, 100, 150)).save(images_dir / f"{index}.jpg")

    def record(index: int, question: str, answer: str) -> dict:
        return {
            "image": f"images/tiny/{index}.jpg",
            "question": question,
            "answer": answer,
            "answers": [answer] * 10,
            "image_id": index,
            "question_id": index,
        }

    train = [record(0, "what color is the cat", "brown"), record(0, "how many", "two")]
    val = [record(1, "what color is the cat", "brown")]
    test = [record(2, "how many flowers", "two"), record(3, "what color is the cat", "brown")]
    for name, records in (("train", train), ("val", val), ("test", test)):
        (data_dir / f"{name}.jsonl").write_text("\n".join(json.dumps(r) for r in records) + "\n")
    return data_dir, {"train": train, "val": val, "test": test}
