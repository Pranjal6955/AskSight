"""Image decoding and validation (A2).

Validation runs on the *decoded* bytes: the declared content type and the
filename are both attacker-controlled, so neither is trusted. A file named
`photo.png` that contains JPEG bytes is accepted as the JPEG it actually is;
a file that is not an image at all is rejected.
"""

from io import BytesIO

from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
# Caps decode memory: Pillow decodes to ~3 bytes per pixel, so a 10 MB file
# can still ask for gigabytes of RAM.
MAX_IMAGE_PIXELS = 40_000_000

# Decoded format -> MIME type. Only these two are accepted.
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


def decode_image(data: bytes) -> tuple[Image.Image, str, int, int]:
    """Decode image bytes and return (image, mime_type, width, height).

    Raises ValueError when the bytes are empty, too large, not an image, an
    image in a format we do not accept, or too many pixels to decode safely.
    """
    if not data:
        raise ValueError("The image was empty. Please retake the photo and try again.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("The image is too large. Please upload an image of 10 MB or less.")

    try:
        image = Image.open(BytesIO(data))
    except Image.DecompressionBombError as exc:
        raise ValueError("The image is too large. Please use a photo under 40 megapixels.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(
            "Could not read the image. Please retake the photo and try again."
        ) from exc

    # Checked before load(): decoding allocates ~3 bytes per pixel.
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("The image is too large. Please use a photo under 40 megapixels.")

    try:
        image.load()  # force decode now, so a truncated file fails here
    except (OSError, Image.DecompressionBombError) as exc:
        raise ValueError(
            "Could not read the image. Please retake the photo and try again."
        ) from exc

    fmt = (image.format or "").upper()
    if fmt not in ALLOWED_FORMATS:
        raise ValueError("Only JPEG and PNG images are supported.")

    return image, ALLOWED_FORMATS[fmt], image.width, image.height


def extension_for(mime_type: str) -> str:
    """File extension for a stored MIME type."""
    return {"image/jpeg": ".jpg", "image/png": ".png"}[mime_type]
