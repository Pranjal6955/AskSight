"""Test bootstrap. Runs before any `app.*` import.

`app.core.security` reads JWT at import time and nothing in the app loads
`.env`, so the secret is set here to keep tests hermetic and offline.
"""

import os

os.environ.setdefault("JWT", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "postgresql://unused:in-tests")
