import pytest

from asksight_model.calibrate_confidence import accuracy_coverage_curve


def test_accuracy_coverage_curve_reports_answered_accuracy():
    curve = accuracy_coverage_curve(
        [0.1, 0.9], ["wrong", "right"], [["right"] * 10, ["right"] * 10]
    )
    assert curve[0]["threshold"] == 0.0
    assert curve[0]["coverage"] == 1.0
    assert curve[0]["accuracy"] == pytest.approx(0.5)
    assert curve[-1]["threshold"] == 0.9
    assert curve[-1]["coverage"] == 0.5
    assert curve[-1]["accuracy"] == 1.0


def test_accuracy_coverage_requires_aligned_data():
    with pytest.raises(ValueError, match="equal lengths"):
        accuracy_coverage_curve([0.5], [], [])
