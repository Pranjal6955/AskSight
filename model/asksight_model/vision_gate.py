"""Pre-inference image quality gate using OpenCV.

Checks input image quality before invoking the VLM to save compute and
provide immediate, actionable voice feedback to blind and low-vision users.
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# Reject thresholds
DARK_LUMA_THRESHOLD = 25.0
BLUR_LAPLACIAN_VAR_THRESHOLD = 85.0

DARK_IMAGE_MESSAGE = (
    "The image is too dark to see clearly. Please turn on a light or move to a brighter area and try again."
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

    # 1. Dark frame check: mean grayscale luma < 25
    mean_luma = float(np.mean(gray))
    if mean_luma < DARK_LUMA_THRESHOLD:
        return False, DARK_IMAGE_MESSAGE

    # 2. Blurred frame check: Laplacian variance < 85
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if laplacian_var < BLUR_LAPLACIAN_VAR_THRESHOLD:
        return False, BLURRY_IMAGE_MESSAGE

    return True, None
