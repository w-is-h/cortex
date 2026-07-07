import sqlite3

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse

from ..auth import User, require_user
from ..db import get_db
from ..services import images

router = APIRouter(prefix="/api/images")


@router.post("")
def upload_image(file: UploadFile, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    return images.save(db, user, file.file.read(), file.content_type or "", file.filename)


@router.get("/{image_id}")
def get_image(image_id: str, user: User = Depends(require_user),
              db: sqlite3.Connection = Depends(get_db)):
    meta, path = images.get(db, image_id)
    return FileResponse(path, media_type=meta["content_type"],
                        headers={"Cache-Control": "private, max-age=31536000, immutable"})
