"""Pre-inference image quality gate using OpenCV.

Checks input image quality before invoking the VLM to save compute and
provide immediate, actionable voice feedback to blind and low-vision users.
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# Conservative thresholds. These only reject frames with no usable overall
# illumination or near-uniform softness; local clarity cannot be inferred from
# whole-frame statistics alone.
DARK_LUMA_THRESHOLD = 25.0
BLUR_LAPLACIAN_VAR_THRESHOLD = 85.0

DARK_IMAGE_MESSAGE = (
    "The image is too dark to see clearly. Please turn on a light "
    "or move to a brighter area and try again."
)
BLURRY_IMAGE_MESSAGE = (
    "The image is too blurry to read safely. Please hold the camera steady and try again."
)


def check_image_quality(image: Image.Image) -> tuple[bool, str | None]:
    """Check image brightness and blurriness using OpenCV.

    Args:
        image: A PIL Image object.

    Returns:
        (is_valid, error_message):
            - If passed quality check: (True, None)
            - If failed quality check: (False, user_facing_guidance_message)
    """
    if not isinstance(image, Image.Image):
        raise ValueError(f"image must be a PIL.Image.Image, got {type(image).__name__}")

    rgb_arr = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2GRAY)

    # A bright, readable region (for example a lit sign at night) should keep
    # the full frame from being rejected just because its average is dark.
    bright_tail_luma = float(np.percentile(gray, 90))
    if bright_tail_luma < DARK_LUMA_THRESHOLD:
        return False, DARK_IMAGE_MESSAGE

    if gray.shape[0] < 3 or gray.shape[1] < 3:
        return True, None

    # Examine spatial regions so a sharp sign or label can pass even if the
    # background is smooth. Reject only when nearly the whole frame is soft;
    # this heuristic is intentionally conservative for accessibility use.
    tile_variances = []
    for tile_y in np.array_split(gray, 4, axis=0):
        for tile in np.array_split(tile_y, 4, axis=1):
            if tile.shape[0] >= 3 and tile.shape[1] >= 3:
                tile_variances.append(float(cv2.Laplacian(tile, cv2.CV_64F).var()))
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    low_contrast = float(np.std(gray)) < 8.0
    has_sharp_region = any(value >= BLUR_LAPLACIAN_VAR_THRESHOLD for value in tile_variances)
    if laplacian_var < BLUR_LAPLACIAN_VAR_THRESHOLD and not has_sharp_region and not low_contrast:
        return False, BLURRY_IMAGE_MESSAGE

    return True, None
