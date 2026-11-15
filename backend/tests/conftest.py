"""Keep tests off a developer's real checkpoint.

`app.main` calls `load_dotenv()` at import; the local `.env` may point at a
multi-GB checkpoint. Setting the variable here (before that import, and with
`override=False` semantics) makes the default service the development mock.
Tests that exercise checkpoint loading set the variable explicitly.
"""

import os

os.environ["ASKSIGHT_MODEL_CHECKPOINT"] = ""
