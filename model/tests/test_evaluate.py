"""VQA accuracy and answer-quality metric tests (B6)."""

import pytest

from asksight_model.evaluate import (
    answer_contains,
    fact_coverage,
    fact_metrics,
    is_complete_sentence,
    normalize_answer,
    sentence_rate,
    vqa_accuracy,
    vqa_accuracy_contains,
)


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


def test_answer_contains_matches_sentence_answers():
    assert answer_contains("The cow is black and white.", "black and white")
    assert answer_contains("Yes, it is.", "yes")
    assert answer_contains("The plane is in the sky.", "in the sky")
    assert not answer_contains("The cat is brown.", "dog")
    assert not answer_contains("", "yes")


def test_vqa_accuracy_contains_scores_sentences():
    assert vqa_accuracy_contains(["Yes, it is."], [["yes"] * 10]) == 1.0
    assert vqa_accuracy_contains(["The cow is brown."], [["brown"] * 10]) == 1.0
    assert vqa_accuracy_contains(["The cow is brown."], [["blue"] * 10]) == 0.0


def test_sentence_rate_counts_complete_multi_word_answers():
    assert is_complete_sentence("The plane is in the sky.")
    assert is_complete_sentence("Yes, it is.")
    assert not is_complete_sentence("airport")
    assert not is_complete_sentence("Yes.")
    assert sentence_rate(["Yes, it is.", "airport", "The plane is in the sky."]) == pytest.approx(
        2 / 3
    )


def test_fact_coverage_reports_missing_rubric_terms():
    prediction = "A red fire truck is parked in the snow."
    facts = ["A red fire truck is visible.", "The ground is covered with snow."]
    assert fact_coverage(prediction, facts) == 0.5
    assert fact_coverage(prediction, []) is None


def test_fact_metrics_are_empty_without_facts():
    assert fact_metrics([("answer", None)]) == {}
    metrics = fact_metrics([("A red fire truck is parked.", ["A red fire truck is visible."])])
    assert metrics == {"fact_recall": 1.0, "all_facts_rate": 1.0}
