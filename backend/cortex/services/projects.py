import re
import sqlite3
from datetime import date

from ..auth import User, now
from ..errors import NotFound
from . import comments, spaces, tasks

COUNTS_SQL = f"""
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
        AND {tasks.not_done('t')}) AS open_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks
"""


def _row(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["archived"] = bool(d["archived"])
    d["tags"] = d["tags"].split()
    return d


def norm_tags(tags: list[str]) -> list[str]:
    """lowercase, no leading '#', hyphens for inner spaces, deduped in order."""
    out: list[str] = []
    for tag in tags:
        tag = re.sub(r"\s+", "-", tag.strip().lstrip("#").lower())
        if tag and tag not in out:
            out.append(tag)
    return out


def list_projects(db: sqlite3.Connection, space_id: int, include_archived: bool = False,
                  tags: list[str] | None = None) -> list[dict]:
    clauses, params = ["p.space_id = ?"], [space_id]
    if not include_archived:
        clauses.append("p.archived = 0")
    for tag in norm_tags(tags or []):  # AND semantics: every tag must be present
        clauses.append("' ' || p.tags || ' ' LIKE ?")
        params.append(f"% {tag} %")
    rows = db.execute(
        f"SELECT p.*, {COUNTS_SQL} FROM projects p WHERE {' AND '.join(clauses)} "
        "ORDER BY p.due_date IS NULL, p.due_date, p.id",
        params,
    )
    return [_row(r) for r in rows]


def get(db: sqlite3.Connection, project_id: int) -> dict:
    row = db.execute(
        f"SELECT p.*, {COUNTS_SQL} FROM projects p WHERE p.id = ?", (project_id,)
    ).fetchone()
    if row is None:
        raise NotFound("project not found")
    return _row(row)


def create(db: sqlite3.Connection, actor: User, data: dict) -> dict:
    spaces.get(db, data["space_id"])
    cur = db.execute(
        """INSERT INTO projects (space_id, title, description, due_date, start_date,
               owner_id, status, tags, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data["space_id"], data["title"], data.get("description", ""),
         _iso(data.get("due_date")), _iso(data.get("start_date")), data.get("owner_id"),
         data["status"], " ".join(norm_tags(data.get("tags") or [])), now()),
    )
    return get(db, cur.lastrowid)


def detail(db: sqlite3.Connection, project: dict) -> dict:
    """Attach comments and tasks to a project dict."""
    project["comments"] = comments.list_for(db, "project", project["id"])
    project["tasks"] = tasks.list_tasks(db, project_id=project["id"])
    return project


UPDATABLE = {"title", "description", "due_date", "start_date", "owner_id",
             "status", "tags", "archived"}


def update(db: sqlite3.Connection, actor: User, project_id: int, fields: dict) -> dict:
    get(db, project_id)
    fields = {k: v for k, v in fields.items() if k in UPDATABLE}
    if not fields:
        return get(db, project_id)
    values = [" ".join(norm_tags(v)) if isinstance(v, list)
              else int(v) if isinstance(v, bool)
              else _iso(v) if isinstance(v, date) else v
              for v in fields.values()]
    sets = ", ".join(f"{k} = ?" for k in fields)
    db.execute(f"UPDATE projects SET {sets} WHERE id = ?", (*values, project_id))
    return get(db, project_id)


def _iso(value):
    return value.isoformat() if isinstance(value, date) else value
