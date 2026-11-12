"""File storage for knowledge base attachments.

Files live under <UPLOAD_DIR>/<document_id>/<random name>. On Kubernetes UPLOAD_DIR is a shared
(ReadWriteMany) Longhorn volume, so every backend replica sees the same files.
"""
import logging
import os
import re
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_BYTES = settings.max_upload_mb * 1024 * 1024
_CHUNK = 1024 * 1024

# Files that run when double-clicked are refused; everything else is served as a plain download.
BLOCKED_EXTENSIONS = {
    ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".pif", ".ps1", ".vbs", ".vbe", ".js", ".jse",
    ".wsf", ".wsh", ".hta", ".jar", ".lnk", ".reg", ".dll", ".sh",
}


def root() -> Path:
    return Path(settings.upload_dir)


def check_storage() -> bool:
    """Create the upload directory if needed and report whether it is writable."""
    try:
        root().mkdir(parents=True, exist_ok=True)
        probe = root() / f".write-test-{uuid.uuid4().hex}"
        probe.write_bytes(b"")
        probe.unlink()
        return True
    except OSError as exc:
        logger.warning("Upload directory %s is not writable: %s. File uploads will fail.", root(), exc)
        return False


def clean_name(name: str | None) -> str:
    name = os.path.basename((name or "").replace("\\", "/")).strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    return name[:200] or "file"


def save_upload(document_id: str, upload: UploadFile) -> tuple[str, str, int]:
    """Write the upload to disk. Returns (original_name, stored_name, size)."""
    original = clean_name(upload.filename)
    extension = Path(original).suffix.lower()
    if extension in BLOCKED_EXTENSIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "file_type_blocked")

    folder = root() / document_id
    stored = uuid.uuid4().hex + (extension if re.fullmatch(r"\.[a-z0-9]{1,10}", extension) else "")
    target = folder / stored
    size = 0
    try:
        folder.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as out:
            while chunk := upload.file.read(_CHUNK):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file_too_large")
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except OSError as exc:
        target.unlink(missing_ok=True)
        logger.error("Could not store upload in %s: %s", folder, exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "storage_unavailable")
    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "file_empty")
    return original, stored, size


def file_path(document_id: str, stored_name: str) -> Path:
    return root() / document_id / stored_name


def delete_file(document_id: str, stored_name: str) -> None:
    try:
        file_path(document_id, stored_name).unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not delete %s/%s: %s", document_id, stored_name, exc)


def delete_document_folder(document_id: str) -> None:
    shutil.rmtree(root() / document_id, ignore_errors=True)
