import pytest

from asksight_model.question_prep import normalize_question


@pytest.mark.parametrize(
    ("noisy", "expected"),
    [
        ("  WHAT   COLOR is the cow?? ", "what color is the cow?"),
        ("wat color is the cow", "what color is the cow?"),
        ("wht color is the cow", "what color is the cow?"),
        ("whats the color of the cow", "what is the color of the cow?"),
        ("clor of cow", "what is color of cow?"),
        ("what clor is the cow", "what color is the cow?"),
        ("what colur is the cow", "what color is the cow?"),
        ("describe the imge", "describe the image?"),
        ("descibe this photo", "describe this photo?"),
        ("desribe this picture", "describe this picture?"),
        ("describ the cat", "describe the cat?"),
        ("wher is the dog", "where is the dog?"),
        ("hwo many people", "how many people?"),
        ("how manny cats are there", "how many cats are there?"),
        ("how many peaple are visible", "how many people are visible?"),
        ("what is the dog hlding", "what is the dog holding?"),
        ("what is the person wearng", "what is the person wearing?"),
        ("describe the backgroud", "describe the background?"),
        ("is the object blak", "is the object black?"),
        ("is the object wite", "is the object white?"),
        ("is the cow browm", "is the cow brown?"),
        ("is the grass grenn", "is the grass green?"),
        ("can you tell me the color of the cow", "what is the color of the cow?"),
        ("could you say the color of the cow", "what is the color of the cow?"),
        ("i want to know the color of the cow", "what is the color of the cow?"),
        ("can i describe me clor is the cow", "what is the color of the cow?"),
        ("can i describe me color is the cow", "what is the color of the cow?"),
        ("could you say where the cat is", "where the cat is?"),
        ("can you tell me how many dogs", "how many dogs?"),
        ("i want to know what the sign says", "what the sign says?"),
        ("what color is it", "what color is it?"),
        ("describe about this image", "describe about this image?"),
        ("what text is shown", "what text is shown?"),
        ("where is the person", "where is the person?"),
        ("how many objects are in the photo", "how many objects are in the photo?"),
    ],
)
def test_normalizes_noisy_questions(noisy, expected):
    assert normalize_question(noisy) == expected


@pytest.mark.parametrize("valid", ["cat", "color", "brown", "people", "cow", "image"])
def test_never_corrects_valid_whitelisted_words(valid):
    assert valid in normalize_question(f"what {valid}").split()


def test_indirect_cow_question_is_not_rewritten_as_yes_no():
    normalized = normalize_question("Can I describe me clor is the cow")
    assert normalized == "what is the color of the cow?"
    assert not normalized.startswith("can ")
