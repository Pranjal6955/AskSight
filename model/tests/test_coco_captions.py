"""COCO description-row tests: distinct multi-sentence descriptions."""

from asksight_model.coco_captions import _description_rows, _distinct_captions


def captions():
    return [
        {"id": 1, "caption": "A cow is in a field."},
        {"id": 2, "caption": "A cow is standing in a field."},
        {"id": 3, "caption": "Trees line the horizon."},
    ]


def test_distinct_captions_drops_near_duplicates():
    selected = _distinct_captions(captions(), 3)
    assert selected == ["A cow is in a field.", "Trees line the horizon."]


def test_distinct_captions_respects_limit():
    assert len(_distinct_captions(captions(), 1)) == 1


def test_description_rows_combine_into_one_row():
    rows = _description_rows(42, captions(), 3, "images/train2014/42.jpg")
    assert len(rows) == 1
    assert rows[0]["question_id"] == "coco-caption-42"
    assert rows[0]["answer"] == "A cow is in a field. Trees line the horizon."


def test_description_rows_keep_one_row_per_caption_when_disabled():
    rows = _description_rows(42, captions(), 0, "images/train2014/42.jpg")
    assert [row["question_id"] for row in rows] == [
        "coco-caption-1",
        "coco-caption-2",
        "coco-caption-3",
    ]
