import sqlite3
import uuid

from ..auth import User, now
from ..db import uploads_dir
from ..errors import CortexError, NotFound

ALLOWED = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
MAX_BYTES = 10 * 1024 * 1024


def save(db: sqlite3.Connection, actor: User, data: bytes,
         content_type: str, original_name: str | None) -> dict:
    ext = ALLOWED.get(content_type)
    if ext is None:
        raise CortexError(f"content type must be one of {', '.join(ALLOWED)}")
    if len(data) > MAX_BYTES:
        raise CortexError("image exceeds 10 MB")
    image_id = uuid.uuid4().hex
    uploads_dir().mkdir(parents=True, exist_ok=True)
    (uploads_dir() / f"{image_id}.{ext}").write_bytes(data)
    db.execute(
        "INSERT INTO images (id, original_name, content_type, size, uploaded_by, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (image_id, original_name, content_type, len(data), actor.id, now()),
    )
    return {"id": image_id, "url": f"/api/images/{image_id}"}


def get(db: sqlite3.Connection, image_id: int) -> tuple[dict, str]:
    row = db.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        raise NotFound("image not found")
    d = dict(row)
    path = uploads_dir() / f"{d['id']}.{ALLOWED[d['content_type']]}"
    if not path.is_file():
        raise NotFound("image file missing")
    return d, str(path)
