"""Conservative cleanup for short visual questions."""

from __future__ import annotations

import re

# Only words common in image questions are considered. Valid words are never
# corrected, and an edit is accepted only when it has one unambiguous match.
QUESTION_VOCABULARY = frozenset(
    {
        "color", "colour", "describe", "what", "how", "many", "is", "are",
        "the", "of", "this", "that", "image", "photo", "picture", "cow",
        "cat", "dog", "person", "people", "object", "visible", "in", "on",
        "it", "there", "where", "who", "wearing", "holding", "text",
        "read", "shown", "background", "black", "white", "red", "blue",
        "green", "brown", "yellow", "orange", "pink", "gray", "grey",
        "purple", "man", "woman", "animal", "please", "can", "could",
        "you", "i", "me", "tell", "say", "want", "to", "know", "about",
        "whats",
    }
)
KNOWN_TYPOS = frozenset(
    {
        "clor", "colur", "descibe", "desribe", "describ", "imge", "pictur",
        "wher", "manny", "peaple", "hlding", "wearng", "backgroud", "blak",
        "wite", "browm", "grenn",
    }
)

_SPECIAL_CORRECTIONS = {
    "whats": "what is",
    "wat": "what",
    "wht": "what",
    "hwo": "how",
    "colur": "color",
}


def _edit_distance_one(a: str, b: str) -> bool:
    """Whether strings differ by one insertion, deletion, or substitution."""
    if abs(len(a) - len(b)) > 1:
        return False
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    edits += (i < len(a)) + (j < len(b))
    return edits == 1


def _correct_word(word: str) -> str:
    if word in QUESTION_VOCABULARY:
        return word
    if word not in KNOWN_TYPOS:
        return word
    matches = [
        candidate
        for candidate in QUESTION_VOCABULARY
        if _edit_distance_one(word, candidate)
    ]
    if len(matches) == 1:
        return matches[0]
    return word


def normalize_question(question: str) -> str:
    """Normalize a question without rewriting its meaning or valid words."""
    text = re.sub(r"\s+", " ", question.strip().lower())
    words = re.findall(r"[a-z0-9']+|[^\w\s]", text)
    corrected: list[str] = []
    for word in words:
        if word.isalpha():
            corrected.extend(_SPECIAL_CORRECTIONS.get(word, _correct_word(word)).split())
        else:
            corrected.append(word)
    text = " ".join(corrected)
    text = re.sub(r"\s+([?.!,])", r"\1", text)
    text = re.sub(r"([?.!,])(?=\S)", r"\1 ", text).strip()
    text = re.sub(r"[?.!]+$", "", text).strip()

    # Requests about "what something looks like" are sometimes framed as a
    # request to describe the user's own perception. Convert those to a visual
    # question, never to a yes/no question.
    text = re.sub(r"^(?:can|could) i describe me\s+", "", text)
    text = re.sub(r"^(?:can you tell me|could you say|i want to know)\s+", "", text)
    match = re.fullmatch(r"(?:the )?([a-z]+) is (?:the )?(.+)", text)
    if match and match.group(1) in {"color", "colour"}:
        text = f"what is the {match.group(1)} of the {match.group(2)}"
    elif text and not re.match(
        r"^(what|which|where|who|how|is|are|does|do|can|describe)\b", text
    ):
        text = f"what is {text}"

    return text.rstrip("?.! ") + "?" if text else ""
