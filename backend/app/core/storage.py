"""File storage for user images (A2).

Local disk for development, S3 (or any S3-compatible endpoint) for production,
behind one save/read/delete interface so the routes never know which is in use.
Storage keys are opaque — a user-supplied filename never becomes a path.
"""

import os
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

STORAGE_BACKEND_ENV = "STORAGE_BACKEND"
STORAGE_ROOT_ENV = "STORAGE_ROOT"
DEFAULT_STORAGE_ROOT = "storage"
STORAGE_S3_BUCKET_ENV = "STORAGE_S3_BUCKET"
STORAGE_S3_PREFIX_ENV = "STORAGE_S3_PREFIX"

_MISSING_KEY_CODES = ("NoSuchKey", "NotFound", "404")


def new_key(extension: str) -> str:
    """An opaque storage key. Never derived from anything the client sent."""
    return f"{uuid4().hex}{extension}"


def _is_missing_key(exc: Exception) -> bool:
    """True for S3 'key does not exist' errors, without importing botocore."""
    response = getattr(exc, "response", None) or {}
    code = response.get("Error", {}).get("Code")
    return code in _MISSING_KEY_CODES


class LocalStorage:
    """Stores image bytes on disk under opaque keys."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def save(self, data: bytes, extension: str) -> str:
        """Write bytes and return the opaque key they were stored under."""
        key = new_key(extension)
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


class S3Storage:
    """S3-compatible object storage behind the same interface as local disk."""

    def __init__(self, bucket: str, prefix: str = "", client=None) -> None:
        if not bucket:
            raise RuntimeError(f"{STORAGE_BACKEND_ENV}=s3 needs {STORAGE_S3_BUCKET_ENV} to be set")
        if client is None:
            try:
                client = _s3_client()
            except ImportError as exc:
                raise RuntimeError(
                    f"{STORAGE_BACKEND_ENV}=s3 needs boto3; run `pip install boto3`"
                    " or set STORAGE_BACKEND=local"
                ) from exc
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = client

    def save(self, data: bytes, extension: str) -> str:
        key = new_key(extension)
        self.client.put_object(Bucket=self.bucket, Key=self._key(key), Body=data)
        return key

    def read(self, key: str) -> bytes | None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=self._key(key))
        except Exception as exc:
            if _is_missing_key(exc):
                return None
            raise
        return response["Body"].read()

    def delete(self, key: str) -> None:
        # S3 delete of a key that does not exist succeeds, matching local disk.
        self.client.delete_object(Bucket=self.bucket, Key=self._key(key))

    def _key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key


@lru_cache(maxsize=1)
def _s3_client():
    # Cached so a request does not build a fresh client (and connection pool)
    # every time get_storage() runs.
    import boto3

    return boto3.client("s3")


def get_storage():
    """The configured storage backend."""
    backend = os.getenv(STORAGE_BACKEND_ENV, "local")
    if backend == "local":
        root = Path(os.getenv(STORAGE_ROOT_ENV, DEFAULT_STORAGE_ROOT))
        if not root.is_absolute():
            root = Path(__file__).resolve().parents[2] / root
        return LocalStorage(root)
    if backend == "s3":
        return S3Storage(
            bucket=os.getenv(STORAGE_S3_BUCKET_ENV, ""),
            prefix=os.getenv(STORAGE_S3_PREFIX_ENV, ""),
        )
    raise RuntimeError(f"{STORAGE_BACKEND_ENV}={backend!r} is not supported; use 'local' or 's3'")
