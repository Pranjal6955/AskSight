"""Image decoding and validation (A2).

Validation runs on the *decoded* bytes: the declared content type and the
filename are both attacker-controlled, so neither is trusted. A file named
`photo.png` that contains JPEG bytes is accepted as the JPEG it actually is;
a file that is not an image at all is rejected.
"""

from io import BytesIO

from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

# Decoded format -> MIME type. Only these two are accepted.
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


def decode_image(data: bytes) -> tuple[Image.Image, str, int, int]:
    """Decode image bytes and return (image, mime_type, width, height).

    Raises ValueError when the bytes are empty, too large, not an image, or
    an image in a format we do not accept.
    """
    if not data:
        raise ValueError("The image was empty. Please retake the photo and try again.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("The image is too large. Please upload an image of 10 MB or less.")

    try:
        image = Image.open(BytesIO(data))
        image.load()  # force decode now, so a truncated file fails here
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(
            "Could not read the image. Please retake the photo and try again."
        ) from exc

    fmt = (image.format or "").upper()
    if fmt not in ALLOWED_FORMATS:
        raise ValueError("Only JPEG and PNG images are supported.")

    return image.convert("RGB"), ALLOWED_FORMATS[fmt], image.width, image.height


def extension_for(mime_type: str) -> str:
    """File extension for a stored MIME type."""
    return {"image/jpeg": ".jpg", "image/png": ".png"}[mime_type]
