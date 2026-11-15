"""Image validation and storage tests (A2)."""

import io

import pytest
from PIL import Image as PILImage

from app.core import storage as storage_module
from app.core.images import MAX_IMAGE_BYTES, decode_image, extension_for
from app.core.storage import LocalStorage, S3Storage, get_storage


def png_bytes(size=(4, 4), color="red"):
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color=color).save(buffer, format="PNG")
    return buffer.getvalue()


def jpeg_bytes(size=(4, 4)):
    buffer = io.BytesIO()
    PILImage.new("RGB", size, color="red").save(buffer, format="JPEG")
    return buffer.getvalue()


class TestDecodeImage:
    def test_decodes_png_and_reports_its_size(self):
        image, mime_type, width, height = decode_image(png_bytes(size=(8, 6)))
        assert mime_type == "image/png"
        assert (width, height) == (8, 6)
        assert image.mode == "RGB"

    def test_decodes_jpeg(self):
        _, mime_type, _, _ = decode_image(jpeg_bytes())
        assert mime_type == "image/jpeg"

    def test_accepts_jpeg_bytes_named_as_png(self):
        # The declared type and filename are attacker-controlled; the decoded
        # format is what counts.
        _, mime_type, _, _ = decode_image(jpeg_bytes())
        assert mime_type == "image/jpeg"

    def test_rejects_non_image_bytes(self):
        with pytest.raises(ValueError, match="Could not read the image"):
            decode_image(b"this is not an image")

    def test_rejects_empty_bytes(self):
        with pytest.raises(ValueError, match="empty"):
            decode_image(b"")

    def test_rejects_truncated_image(self):
        truncated = png_bytes()[:20]
        with pytest.raises(ValueError, match="Could not read the image"):
            decode_image(truncated)

    def test_rejects_oversized_bytes(self, monkeypatch):
        monkeypatch.setattr("app.core.images.MAX_IMAGE_BYTES", 10)
        with pytest.raises(ValueError, match="too large"):
            decode_image(png_bytes())

    def test_rejects_unsupported_format(self):
        buffer = io.BytesIO()
        PILImage.new("RGB", (4, 4)).save(buffer, format="BMP")
        with pytest.raises(ValueError, match="Only JPEG and PNG"):
            decode_image(buffer.getvalue())

    def test_limit_is_ten_megabytes(self):
        assert MAX_IMAGE_BYTES == 10 * 1024 * 1024

    def test_extension_for_known_types(self):
        assert extension_for("image/jpeg") == ".jpg"
        assert extension_for("image/png") == ".png"


class TestLocalStorage:
    def test_save_returns_an_opaque_key_and_stores_bytes(self, tmp_path):
        store = LocalStorage(tmp_path)
        key = store.save(b"hello", ".png")
        assert key.endswith(".png")
        assert "hello" not in key
        assert store.read(key) == b"hello"

    def test_keys_are_unique(self, tmp_path):
        store = LocalStorage(tmp_path)
        assert store.save(b"a", ".png") != store.save(b"a", ".png")

    def test_read_of_unknown_key_returns_none(self, tmp_path):
        assert LocalStorage(tmp_path).read("nope.png") is None

    def test_delete_removes_bytes(self, tmp_path):
        store = LocalStorage(tmp_path)
        key = store.save(b"hello", ".png")
        store.delete(key)
        assert store.read(key) is None

    def test_delete_of_unknown_key_is_not_an_error(self, tmp_path):
        LocalStorage(tmp_path).delete("nope.png")

    def test_refuses_keys_that_escape_the_root(self, tmp_path):
        store = LocalStorage(tmp_path)
        with pytest.raises(ValueError, match="invalid storage key"):
            store.read("../../etc/passwd")

    def test_leaves_no_partial_file_behind(self, tmp_path):
        store = LocalStorage(tmp_path)
        store.save(b"hello", ".png")
        assert not list(tmp_path.glob("*.part"))


class TestGetStorage:
    def test_defaults_to_local_disk_under_the_backend_folder(self, monkeypatch, tmp_path):
        monkeypatch.delenv(storage_module.STORAGE_BACKEND_ENV, raising=False)
        monkeypatch.setenv(storage_module.STORAGE_ROOT_ENV, str(tmp_path))
        assert get_storage().root == tmp_path

    def test_relative_root_resolves_against_the_backend_folder(self, monkeypatch):
        monkeypatch.delenv(storage_module.STORAGE_BACKEND_ENV, raising=False)
        monkeypatch.setenv(storage_module.STORAGE_ROOT_ENV, "storage")
        root = get_storage().root
        assert root.is_absolute()
        assert root.name == "storage"

    def test_unknown_backend_raises(self, monkeypatch):
        monkeypatch.setenv(storage_module.STORAGE_BACKEND_ENV, "ftp")
        with pytest.raises(RuntimeError, match="not supported"):
            get_storage()

    def test_s3_backend_needs_a_bucket(self, monkeypatch):
        monkeypatch.setenv(storage_module.STORAGE_BACKEND_ENV, "s3")
        monkeypatch.delenv(storage_module.STORAGE_S3_BUCKET_ENV, raising=False)
        with pytest.raises(RuntimeError, match="STORAGE_S3_BUCKET"):
            get_storage()

    def test_selects_s3_with_bucket_and_prefix(self, monkeypatch):
        monkeypatch.setenv(storage_module.STORAGE_BACKEND_ENV, "s3")
        monkeypatch.setenv(storage_module.STORAGE_S3_BUCKET_ENV, "bucket")
        monkeypatch.setenv(storage_module.STORAGE_S3_PREFIX_ENV, "uploads")
        monkeypatch.setattr(storage_module, "_s3_client", lambda: object())
        store = get_storage()
        assert isinstance(store, S3Storage)
        assert store.bucket == "bucket"
        assert store.prefix == "uploads"

    def test_s3_backend_requires_boto3(self, monkeypatch):
        monkeypatch.setenv(storage_module.STORAGE_BACKEND_ENV, "s3")
        monkeypatch.setenv(storage_module.STORAGE_S3_BUCKET_ENV, "bucket")
        monkeypatch.setattr(storage_module, "_s3_client", _broken_boto3)
        with pytest.raises(RuntimeError, match="boto3"):
            get_storage()


def _broken_boto3():
    raise ImportError("no boto3")


class MissingKey(Exception):
    """Stand-in for botocore's NoSuchKey, which `_is_missing_key` duck-types."""

    response = {"Error": {"Code": "NoSuchKey"}}


class FakeS3Client:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body):
        self.objects[(Bucket, Key)] = bytes(Body)

    def get_object(self, Bucket, Key):
        try:
            body = self.objects[(Bucket, Key)]
        except KeyError:
            raise MissingKey() from None
        return {"Body": io.BytesIO(body)}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


class TestS3Storage:
    def make(self, prefix=""):
        return S3Storage(bucket="bucket", prefix=prefix, client=FakeS3Client())

    def test_save_returns_an_opaque_key_and_stores_bytes(self):
        store = self.make()
        key = store.save(b"hello", ".png")
        assert key.endswith(".png")
        assert store.read(key) == b"hello"

    def test_keys_are_unique(self):
        store = self.make()
        assert store.save(b"a", ".png") != store.save(b"a", ".png")

    def test_read_of_unknown_key_returns_none(self):
        assert self.make().read("nope.png") is None

    def test_delete_removes_bytes_and_unknown_keys_are_fine(self):
        store = self.make()
        key = store.save(b"hello", ".png")
        store.delete(key)
        assert store.read(key) is None
        store.delete("nope.png")

    def test_prefix_is_applied_to_the_object_key(self):
        store = self.make(prefix="/uploads/")
        key = store.save(b"hello", ".png")
        assert ("bucket", f"uploads/{key}") in store.client.objects
        assert ("bucket", key) not in store.client.objects

    def test_non_missing_errors_propagate(self):
        class Boom(Exception):
            response = {"Error": {"Code": "AccessDenied"}}

        class Broken(FakeS3Client):
            def get_object(self, Bucket, Key):
                raise Boom()

        store = S3Storage(bucket="bucket", client=Broken())
        with pytest.raises(Boom):
            store.read("anything.png")
