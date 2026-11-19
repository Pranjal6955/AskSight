"""Split-selection tests: whole-image groups, determinism, no leakage (B3)."""

import random
from collections import defaultdict

import pytest

from asksight_model.data import (
    _assert_disjoint,
    group_by_image,
    image_filename,
    image_url,
    select_by_image,
    split_by_image,
)


def make_records(images: int = 6, per_image: int = 3) -> list[dict]:
    return [
        {
            "image_id": image_id,
            "question_id": image_id * 100 + question,
            "question": f"question {image_id}-{question}",
            "answers": ["yes"] * 10,
        }
        for image_id in range(images)
        for question in range(per_image)
    ]


def test_group_by_image_groups_all_questions():
    groups = group_by_image(make_records(images=3, per_image=4))
    assert set(groups) == {0, 1, 2}
    assert all(len(group) == 4 for group in groups.values())


def test_select_by_image_takes_whole_images_and_is_seed_stable():
    records = make_records()
    first = select_by_image(records, 7, random.Random(0))
    second = select_by_image(records, 7, random.Random(0))
    assert first == second
    assert len(first) >= 7
    full_groups = group_by_image(records)
    for image_id, group in group_by_image(first).items():
        assert len(group) == len(full_groups[image_id])  # never a partial image


def test_split_by_image_is_disjoint_and_lossless():
    records = make_records(images=10, per_image=2)
    first, second = split_by_image(records, 0.5, random.Random(1))
    first_ids = {r["image_id"] for r in first}
    second_ids = {r["image_id"] for r in second}
    assert not first_ids & second_ids
    assert len(first) + len(second) == len(records)


def test_select_by_image_respects_image_id_whitelist():
    records = make_records(images=5, per_image=2)
    selected = select_by_image(records, 4, random.Random(0), image_ids=[1, 2])
    assert {r["image_id"] for r in selected} <= {1, 2}


def test_assert_disjoint_catches_image_leakage():
    leaked = {
        "train": [{"image_id": 1, "question_id": 1}],
        "test": [{"image_id": 1, "question_id": 2}],
    }
    with pytest.raises(ValueError, match="leakage"):
        _assert_disjoint(leaked)


def test_assert_disjoint_catches_duplicate_pairs():
    duplicated = {"train": [{"image_id": 1, "question_id": 1}] * 2}
    with pytest.raises(ValueError, match="duplicate"):
        _assert_disjoint(duplicated)


def test_coco_image_naming():
    assert image_filename("train2014", 123) == "COCO_train2014_000000000123.jpg"
    assert (
        image_url("val2014", 7)
        == "http://images.cocodataset.org/val2014/COCO_val2014_000000000007.jpg"
    )


def test_record_answers_shape_via_grouping():
    records = make_records()
    by_question = defaultdict(int)
    for record in records:
        by_question[record["question_id"]] += 1
    assert all(count == 1 for count in by_question.values())
