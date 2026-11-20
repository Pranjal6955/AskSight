"""Sentence-target rewriter tests (answer quality work)."""

import pytest

from asksight_model.targets import to_sentence


@pytest.mark.parametrize(
    ("question", "answer", "expected"),
    [
        ("What color is the cow?", "black and white", "The cow is black and white."),
        ("What color are the flowers?", "red", "The flowers are red."),
        ("What is the color of the truck?", "red", "The truck is red."),
        (
            "How many pillows are on the bed?",
            "4",
            "The number of pillows on the bed is 4.",
        ),
        ("How many sheep can be seen?", "2", "The number of sheep is 2."),
        ("How many boats are there?", "3", "The number of boats is 3."),
        ("Is this a lake?", "yes", "Yes, that is correct."),
        ("Are both buses double decker buses?", "no", "No, that is not correct."),
        ("Does the sandwich have tomatoes?", "no", "No, that is not correct."),
        (
            "Can the dog jump?",
            "yes",
            "Yes, that is correct.",
        ),
        ("Is the plane coming or going?", "coming", "The plane is coming."),
        (
            "What is this person doing?",
            "riding a motorcycle",
            "The person is riding a motorcycle.",
        ),
        (
            "What is this person doing?",
            "riding motorcycle",
            "The person is riding a motorcycle.",
        ),
        ("What room is this?", "hotel room", "This is a hotel room."),
        ("What number is on the sign?", "40", "The number on the sign is 40."),
        (
            "What is this sport called?",
            "water skiing",
            "This is called water skiing.",
        ),
        ("What is this?", "cow", "This is a cow."),
        ("What is that?", "dog", "That is a dog."),
        ("What are these?", "cows", "These are cows."),
        ("What is on the table?", "cup", "There is a cup on the table."),
        (
            "What is the weather in this photo?",
            "cold",
            "The weather in this photo is cold.",
        ),
        ("What is the man wearing?", "a suit", "The man is wearing a suit."),
        ("Why is the man smiling?", "happy", "The image shows happy."),
    ],
)
def test_to_sentence_common_forms(question, answer, expected):
    assert to_sentence(question, answer) == expected


def test_to_sentence_keeps_reviewed_sentences_unchanged():
    sentence = "A red fire truck is parked beside a snow-covered road."
    assert to_sentence("Describe this photo.", sentence) == sentence


def test_to_sentence_empty_answer():
    assert to_sentence("What is this?", "  ") == ""
