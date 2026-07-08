import re
import sqlite3
import uuid

from ..auth import User, now
from ..db import uploads_dir
from ..errors import CortexError, NotFound

# Image types safe to render inline in the browser; anything else uploads
# fine but is served as a download (Content-Disposition: attachment).
INLINE = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
MAX_BYTES = 10 * 1024 * 1024


def save(db: sqlite3.Connection, actor: User, data: bytes,
         content_type: str, original_name: str | None) -> dict:
    if len(data) > MAX_BYTES:
        raise CortexError("file exceeds 10 MB")
    ext = INLINE.get(content_type)
    if ext is None:
        m = re.search(r"\.([A-Za-z0-9]{1,8})$", original_name or "")
        ext = m.group(1).lower() if m else "bin"
    file_id = uuid.uuid4().hex
    uploads_dir().mkdir(parents=True, exist_ok=True)
    (uploads_dir() / f"{file_id}.{ext}").write_bytes(data)
    db.execute(
        "INSERT INTO images (id, original_name, content_type, size, uploaded_by, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (file_id, original_name, content_type, len(data), actor.id, now()),
    )
    return {"id": file_id, "url": f"/api/images/{file_id}"}


def get(db: sqlite3.Connection, image_id: str) -> tuple[dict, str]:
    row = db.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        raise NotFound("file not found")
    d = dict(row)
    path = next(uploads_dir().glob(f"{d['id']}.*"), None)
    if path is None:
        raise NotFound("file missing")
    return d, str(path)
