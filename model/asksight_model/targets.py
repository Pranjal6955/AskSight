"""Turn short VQA answers into complete-sentence training targets.

VQA v2 targets are mostly one or two words, so the model learns to answer in
fragments. This module restates the question as a sentence for the common VQA
forms and falls back to a generic grounded sentence.

This is a rule-based rewriter, not a language model. Spot-check its output
before a training run (see MODEL_QUALITY_TASK.md); the generic fallback is
complete but less specific than the targeted templates.
"""

from __future__ import annotations

import re

SENTENCE_STYLE = "sentence"
SHORT_STYLE = "short"
REWRITER_VERSION = "sentence-v1"

_WORD = re.compile(r"[A-Za-z0-9']+")
_YES = frozenset({"yes", "yeah", "y", "true"})
_NO = frozenset({"no", "nope", "n", "false"})
_NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
_DETERMINERS = frozenset(
    {
        "a",
        "an",
        "the",
        "this",
        "that",
        "these",
        "those",
        "some",
        "many",
        "several",
        "both",
        "all",
        "no",
        "each",
        "every",
    }
)
# Answers that are properties/states rather than countable nouns. Used only to
# decide whether a generic sentence needs "a/an".
_NON_NOUN_ANSWERS = frozenset(
    {
        "yes",
        "no",
        "true",
        "false",
        "brown",
        "black",
        "white",
        "red",
        "blue",
        "green",
        "yellow",
        "orange",
        "pink",
        "gray",
        "grey",
        "purple",
        "cold",
        "hot",
        "warm",
        "cool",
        "sunny",
        "cloudy",
        "rainy",
        "snowy",
        "dark",
        "light",
        "large",
        "small",
        "young",
        "old",
        "tall",
        "short",
        "empty",
        "full",
        "clean",
        "dirty",
        "open",
        "closed",
        "happy",
        "sad",
        "angry",
        "sleeping",
        "standing",
        "sitting",
    }
)
_NON_NOUN_WORDS = frozenset(
    {
        "and",
        "or",
        "with",
        "in",
        "on",
        "at",
        "of",
        "to",
        "from",
        "by",
        "under",
        "near",
        "behind",
    }
)


def _looks_plural(text: str) -> bool:
    first = text.split()[0].lower() if text.split() else ""
    if first in _NUMBER_WORDS and _NUMBER_WORDS[first] != 1:
        return True
    return text.endswith("s") and not text.endswith(("ss", "us", "is"))


def _with_indefinite_article(answer: str) -> str:
    text = answer.strip().rstrip(".")
    words = text.split()
    if not text or words[0].lower() in _DETERMINERS:
        return text
    if text.lower() in _NON_NOUN_ANSWERS or text.lower() in _NUMBER_WORDS:
        return text
    if text[0].isupper() or any(c.isdigit() for c in text):
        return text
    if any(word.lower() in _NON_NOUN_WORDS or word.lower().endswith("ing") for word in words):
        return text
    if _looks_plural(text):
        return text
    article = "an" if text[0].lower() in "aeiou" else "a"
    return f"{article} {text}"


def _action_phrase(answer: str) -> str:
    words = answer.split()
    if len(words) > 1 and words[0].lower().endswith("ing"):
        return f"{words[0]} {_with_indefinite_article(' '.join(words[1:]))}"
    return _with_indefinite_article(answer)


def _subject_predicate(subject: str, verb: str, answer: str) -> str:
    subject = subject.strip().rstrip("?.! ")
    demonstrative = subject.lower()
    if demonstrative in {"this", "it"}:
        return f"{demonstrative.capitalize()} is {answer}."
    if demonstrative in {"that"}:
        return f"That is {answer}."
    if demonstrative in {"these", "they", "those"}:
        return f"{demonstrative.capitalize()} are {answer}."
    clean = re.sub(r"^(?:the|a|an|this|that|these|those) ", "", subject, flags=re.IGNORECASE)
    return f"The {clean} {'are' if verb.lower() == 'are' else 'is'} {answer}."


def _yes_no(answer: str) -> str:
    # A generic confirmation avoids wrong pronoun/auxiliary agreement
    # ("Yes, it is" for "Is the motorcyclist wearing a backpack?").
    positive = answer.lower() in _YES
    return "Yes, that is correct." if positive else "No, that is not correct."


def _count(question: str, answer: str) -> str | None:
    match = re.match(
        r"how many (.+?)(?: (?:are|is|were|was|do|does|can)\b(.*?))?\s*\??$",
        question,
        re.IGNORECASE,
    )
    if not match:
        return None
    object_phrase = match.group(1).strip()
    rest = (match.group(2) or "").strip()
    rest = re.sub(
        r"^(?:there|you see|be seen|be found|be observed|visible|are there|"
        r"do you see|can you see|can be seen|are visible)\b",
        "",
        rest,
        flags=re.IGNORECASE,
    ).strip()
    location = f" {rest}" if rest else ""
    return f"The number of {object_phrase}{location} is {answer}."


def to_sentence(question: str, answer: str) -> str:
    """Return a complete-sentence target for one VQA pair."""
    question = " ".join(str(question).split())
    answer = " ".join(str(answer).split()).strip()
    if not answer:
        return ""
    if len(_WORD.findall(answer)) >= 3 and re.search(r"[.!?]$", answer):
        return answer  # already a sentence (custom/reviewed examples)

    short = answer.rstrip(".!?").strip()
    lowered = short.lower()

    if lowered in _YES or lowered in _NO:
        if re.match(
            r"^(?:is|are|was|were|do|does|did|has|have|can|could|will|would|should|may|must|am)\b",
            question,
            re.IGNORECASE,
        ):
            return _yes_no(short)
        return "Yes, that is correct." if lowered in _YES else "No, that is not correct."

    match = re.match(
        r"what colou?r (is|are) (?:(?:the|this|that|these|those) )?(.+?)\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        return _subject_predicate(match.group(2), match.group(1), short)

    match = re.match(
        r"what is the colou?r of (?:(?:the|this|that) )?(.+?)\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        return _subject_predicate(match.group(1), "is", short)

    sentence = _count(question, short)
    if sentence:
        return sentence

    match = re.match(r"(?:is|are) (?:the )?(.+?) (\w+) or (\w+)\??$", question, re.IGNORECASE)
    if match and lowered in {match.group(2).lower(), match.group(3).lower()}:
        verb = "are" if question.lower().startswith("are") else "is"
        return _subject_predicate(match.group(1), verb, short)

    match = re.match(r"what (is|are) (.+?) doing\??$", question, re.IGNORECASE)
    if match:
        return _subject_predicate(match.group(2), match.group(1), _action_phrase(short))

    match = re.match(
        r"what (?:is|are) (?:(?:the|a|an|this|that) )?(.+?) ([a-z]+ing)\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        return _subject_predicate(
            match.group(1), "is", f"{match.group(2).lower()} {_action_phrase(short)}"
        )

    match = re.match(r"what number is (on|in) (?:the )?(.+?)\??$", question, re.IGNORECASE)
    if match:
        return f"The number {match.group(1).lower()} the {match.group(2)} is {short}."

    match = re.match(r"what is this (?:.+?) called\??$", question, re.IGNORECASE)
    if match:
        return f"This is called {_with_indefinite_article(short)}."

    match = re.match(
        r"what (?:kind of |type of )?(.+?) (?:is|are) (this|that|these|those)\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        subject = match.group(2)
        verb = "are" if subject.lower() in {"these", "those"} else "is"
        return f"{subject.capitalize()} {verb} {_with_indefinite_article(short)}."

    match = re.match(
        r"what (?:is|are) (on|in|at|under|near|behind|next to) (.+?)\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        preposition, place = match.group(1).lower(), match.group(2)
        place = re.sub(r"^(?:the|a|an) ", "", place, flags=re.IGNORECASE)
        if _looks_plural(short):
            return f"There are {short} {preposition} the {place}."
        return f"There is {_with_indefinite_article(short)} {preposition} the {place}."

    match = re.match(
        r"what (?:is|are) (this|that|these|those|it|they)(?:\b.*)?\??$",
        question,
        re.IGNORECASE,
    )
    if match:
        subject = match.group(1)
        verb = "are" if subject.lower() in {"these", "those", "they"} else "is"
        return f"{subject.capitalize()} {verb} {_with_indefinite_article(short)}."

    match = re.match(
        r"what (?:is|are) (?:(?:the|a|an) )?(.+?)(?: like)?\??$", question, re.IGNORECASE
    )
    if match and not match.group(1).lower().startswith(
        ("in ", "on ", "at ", "under ", "near ", "behind ", "next to ")
    ):
        verb = "are" if question.lower().startswith("what are") else "is"
        return _subject_predicate(match.group(1), verb, short)

    return f"The image shows {_with_indefinite_article(short)}."
