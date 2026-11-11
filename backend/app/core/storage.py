"""File storage for user images (A2).

Local disk for development, behind a small interface so object storage can be
swapped in for production without touching the routes. Storage keys are opaque
— a user-supplied filename never becomes a path.
"""

import os
import shutil
from pathlib import Path
from uuid import uuid4

STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
STORAGE_ROOT_ENV = "STORAGE_ROOT"
DEFAULT_STORAGE_ROOT = "storage"


class Storage:
    """Stores image bytes on disk under opaque keys."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def save(self, data: bytes, extension: str) -> str:
        """Write bytes and return the opaque key they were stored under."""
        key = f"{uuid4().hex}{extension}"
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file and rename, so a crash cannot leave a partial
        # image that later reads as corrupt.
        temp = path.with_suffix(path.suffix + ".part")
        temp.write_bytes(data)
        temp.replace(path)
        return key

    def read(self, key: str) -> bytes | None:
        """Return the stored bytes, or None if the key is unknown."""
        path = self._path_for(key)
        if not path.is_file():
            return None
        return path.read_bytes()

    def delete(self, key: str) -> None:
        """Remove stored bytes. Deleting an unknown key is not an error."""
        path = self._path_for(key)
        if path.is_file():
            path.unlink()

    def _path_for(self, key: str) -> Path:
        """Resolve a key to a path, refusing anything outside the root."""
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if root not in path.parents and path != root:
            raise ValueError("invalid storage key")
        return path


def get_storage() -> Storage:
    """The configured storage. Local disk is the only backend today."""
    backend = os.getenv(STORAGE_BACKEND_ENV, "local")
    if backend != "local":
        raise RuntimeError(f"{STORAGE_BACKEND_ENV}={backend!r} is not supported yet; use 'local'")
    root = Path(os.getenv(STORAGE_ROOT_ENV, DEFAULT_STORAGE_ROOT))
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root
    return Storage(root)


def clear_storage_dir(root: Path) -> None:
    """Remove a storage directory. Test helper."""
    shutil.rmtree(root, ignore_errors=True)
