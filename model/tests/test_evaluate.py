"""VQA accuracy metric tests (B6)."""

import pytest

from asksight_model.evaluate import normalize_answer, vqa_accuracy


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ("The cat.", "cat"),
        ("Two", "2"),
        ("Dont", "don't"),
        ("a dog!", "dog"),
        ("  Brown ", "brown"),
    ],
)
def test_normalize_answer_equivalences(left, right):
    assert normalize_answer(left) == normalize_answer(right)


def test_vqa_accuracy_standard_cases():
    assert vqa_accuracy(["brown"], [["brown"] * 10]) == 1.0
    assert vqa_accuracy(["brown"], [["blue"] * 10]) == 0.0
    assert vqa_accuracy(["brown"], [["brown"] + ["blue"] * 9]) == pytest.approx(1 / 3)
    assert vqa_accuracy(["brown"], [["brown"] * 3 + ["blue"] * 7]) == 1.0
    assert vqa_accuracy(["brown", "blue"], [["brown"] * 10, ["blue"] * 10]) == 1.0
    assert vqa_accuracy([], []) == 0.0
