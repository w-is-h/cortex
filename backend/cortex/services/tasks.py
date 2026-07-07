import secrets
import sqlite3

from ..auth import User, now
from ..errors import Conflict, CortexError, NotFound
from . import activity, notifications, spaces


def _gen_ref(db: sqlite3.Connection) -> str:
    """A short, shareable, non-sequential task id like cx-483920175 (for GitHub etc.)."""
    for _ in range(20):
        ref = f"cx-{secrets.randbelow(900_000_000) + 100_000_000}"
        if db.execute("SELECT 1 FROM tasks WHERE ref = ?", (ref,)).fetchone() is None:
            return ref
    raise CortexError("could not allocate a task ref")

# a task is "done" when its status is flagged is_done in its space's status set
def not_done(alias: str) -> str:
    return (f"{alias}.status NOT IN (SELECT key FROM statuses st "
            f"WHERE st.space_id = {alias}.space_id AND st.kind = 'task' AND st.is_done = 1)")


BLOCKED_SQL = f"""EXISTS(
    SELECT 1 FROM task_blocks tb JOIN tasks bt ON bt.id = tb.blocker_id
    WHERE tb.blocked_id = t.id AND {not_done('bt')}) AS blocked"""


def _row_to_task(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["blocked"] = bool(d.get("blocked", 0))
    return d


def get(db: sqlite3.Connection, task_id: int) -> dict:
    row = db.execute(
        f"SELECT t.*, {BLOCKED_SQL} FROM tasks t WHERE t.id = ?", (task_id,)
    ).fetchone()
    if row is None:
        raise NotFound("task not found")
    return _row_to_task(row)


def list_tasks(db: sqlite3.Connection, space_id: int | None = None,
               sprint_id: int | None = None, backlog: bool = False,
               status: str | None = None, assignee_id: int | None = None,
               project_id: int | None = None) -> list[dict]:
    where, params = [], []
    if space_id is not None:
        where.append("t.space_id = ?")
        params.append(space_id)
    if backlog:
        where.append("t.sprint_id IS NULL")
    elif sprint_id is not None:
        where.append("t.sprint_id = ?")
        params.append(sprint_id)
    if status is not None:
        where.append("t.status = ?")
        params.append(status)
    if assignee_id is not None:
        where.append("t.assignee_id = ?")
        params.append(assignee_id)
    if project_id is not None:
        where.append("t.project_id = ?")
        params.append(project_id)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.execute(
        f"SELECT t.*, {BLOCKED_SQL} FROM tasks t {clause} ORDER BY t.sort_order, t.id",
        params,
    )
    return [_row_to_task(r) for r in rows]


def _check_sprint(db, sprint_id: int | None, space_id: int):
    if sprint_id is None:
        return
    row = db.execute("SELECT space_id FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
    if row is None:
        raise NotFound("sprint not found")
    if row["space_id"] != space_id:
        raise Conflict("sprint belongs to a different space")


def _check_project(db, project_id: int | None, space_id: int):
    if project_id is None:
        return
    row = db.execute("SELECT space_id FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise NotFound("project not found")
    if row["space_id"] != space_id:
        raise Conflict("project belongs to a different space")


def _check_assignee(db, assignee_id: int | None):
    if assignee_id is None:
        return
    if db.execute("SELECT 1 FROM users WHERE id = ?", (assignee_id,)).fetchone() is None:
        raise NotFound("assignee not found")


def create(db: sqlite3.Connection, actor: User, data: dict) -> dict:
    space_id = data["space_id"]
    spaces.get(db, space_id)
    _check_sprint(db, data.get("sprint_id"), space_id)
    _check_project(db, data.get("project_id"), space_id)
    _check_assignee(db, data.get("assignee_id"))
    next_order = db.execute("SELECT COALESCE(MAX(sort_order), 0) + 1024 FROM tasks").fetchone()[0]
    ts = now()
    cur = db.execute(
        """INSERT INTO tasks (space_id, title, description, status, priority,
               assignee_id, sprint_id, project_id, sort_order, ref, created_by,
               created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (space_id, data["title"], data.get("description", ""),
         data.get("status", "todo"), data.get("priority", "medium"),
         data.get("assignee_id"), data.get("sprint_id"), data.get("project_id"),
         next_order, _gen_ref(db), actor.id, ts, ts),
    )
    task_id = cur.lastrowid
    activity.record(db, actor, task_id, "created")
    notifications.notify(db, data.get("assignee_id"), "assigned", actor, task_id=task_id)
    notifications.notify_mentions(db, actor, data.get("description", ""), task_id=task_id)
    return get(db, task_id)


UPDATABLE = {"title", "description", "status", "priority",
             "assignee_id", "sprint_id", "project_id", "sort_order"}


def update(db: sqlite3.Connection, actor: User, task_id: int, fields: dict) -> dict:
    before = get(db, task_id)
    fields = {k: v for k, v in fields.items() if k in UPDATABLE}
    if "sprint_id" in fields:
        _check_sprint(db, fields["sprint_id"], before["space_id"])
    if "project_id" in fields:
        _check_project(db, fields["project_id"], before["space_id"])
    if "assignee_id" in fields:
        _check_assignee(db, fields["assignee_id"])
    if not fields:
        return before
    sets = ", ".join(f"{k} = ?" for k in fields)
    db.execute(f"UPDATE tasks SET {sets}, updated_at = ? WHERE id = ?",
               (*fields.values(), now(), task_id))
    _emit_update_events(db, actor, before, fields)
    return get(db, task_id)


ACTIVITY_TYPES = {"status": "status_changed", "priority": "priority_changed",
                  "assignee_id": "assigned", "sprint_id": "sprint_moved",
                  "project_id": "project_changed", "title": "title_edited",
                  "description": "description_edited"}


def _emit_update_events(db, actor: User, before: dict, fields: dict) -> None:
    task_id = before["id"]
    for key, type_ in ACTIVITY_TYPES.items():
        if key in fields and fields[key] != before[key]:
            detail = {"from": before[key], "to": fields[key]}
            if key in ("title", "description"):
                detail = {}  # old/new bodies would bloat the log
            activity.record(db, actor, task_id, type_, detail)
    if fields.get("assignee_id") and fields["assignee_id"] != before["assignee_id"]:
        notifications.notify(db, fields["assignee_id"], "assigned", actor, task_id=task_id)
    if "status" in fields and fields["status"] != before["status"]:
        notifications.notify(db, before["assignee_id"], "status_changed", actor, task_id=task_id)
    if "description" in fields:
        notifications.notify_mentions(db, actor, fields["description"] or "",
                                      old_text=before["description"], task_id=task_id)


def move_to_sprint(db: sqlite3.Connection, actor: User,
                   task_ids: list[int], sprint_id: int | None) -> list[dict]:
    """Bulk move tasks to a sprint, or to the backlog (sprint_id=None)."""
    tasks = [get(db, tid) for tid in task_ids]
    for task in tasks:
        _check_sprint(db, sprint_id, task["space_id"])
    ts = now()
    db.executemany(
        "UPDATE tasks SET sprint_id = ?, updated_at = ? WHERE id = ?",
        [(sprint_id, ts, tid) for tid in task_ids],
    )
    for task in tasks:
        if task["sprint_id"] != sprint_id:
            activity.record(db, actor, task["id"], "sprint_moved",
                            {"from": task["sprint_id"], "to": sprint_id})
    return [get(db, tid) for tid in task_ids]


def delete(db: sqlite3.Connection, actor: User, task_id: int) -> None:
    get(db, task_id)
    db.execute("DELETE FROM comments WHERE parent_type = 'task' AND parent_id = ?", (task_id,))
    db.execute("DELETE FROM notifications WHERE task_id = ?", (task_id,))
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))


def add_blocker(db: sqlite3.Connection, actor: User, task_id: int, blocker_id: int) -> dict:
    get(db, blocker_id)
    if task_id == blocker_id:
        raise Conflict("a task cannot block itself")
    # cycle check: does task_id already (transitively) block blocker_id?
    frontier, seen = [task_id], set()
    while frontier:
        current = frontier.pop()
        if current == blocker_id:
            raise Conflict("blocking cycle")
        if current in seen:
            continue
        seen.add(current)
        frontier += [r["blocked_id"] for r in db.execute(
            "SELECT blocked_id FROM task_blocks WHERE blocker_id = ?", (current,))]
    db.execute(
        "INSERT OR IGNORE INTO task_blocks (blocker_id, blocked_id) VALUES (?, ?)",
        (blocker_id, task_id),
    )
    activity.record(db, actor, task_id, "blocker_added", {"blocker_id": blocker_id})
    return get(db, task_id)


def remove_blocker(db: sqlite3.Connection, actor: User, task_id: int, blocker_id: int) -> dict:
    cur = db.execute("DELETE FROM task_blocks WHERE blocker_id = ? AND blocked_id = ?",
                     (blocker_id, task_id))
    if cur.rowcount:
        activity.record(db, actor, task_id, "blocker_removed", {"blocker_id": blocker_id})
    return get(db, task_id)


def blockers_of(db: sqlite3.Connection, task_id: int) -> list[dict]:
    rows = db.execute(
        f"""SELECT t.*, {BLOCKED_SQL} FROM tasks t
            JOIN task_blocks tb ON tb.blocker_id = t.id
            WHERE tb.blocked_id = ? ORDER BY t.id""", (task_id,))
    return [_row_to_task(r) for r in rows]


def blocking(db: sqlite3.Connection, task_id: int) -> list[dict]:
    rows = db.execute(
        f"""SELECT t.*, {BLOCKED_SQL} FROM tasks t
            JOIN task_blocks tb ON tb.blocked_id = t.id
            WHERE tb.blocker_id = ? ORDER BY t.id""", (task_id,))
    return [_row_to_task(r) for r in rows]


def my_tasks(db: sqlite3.Connection, user_id: int) -> list[dict]:
    """Home view: my unfinished tasks anywhere + everything of mine in current sprints."""
    today = now()[:10]
    rows = db.execute(
        f"""SELECT t.*, {BLOCKED_SQL} FROM tasks t
            LEFT JOIN sprints s ON s.id = t.sprint_id
            WHERE t.assignee_id = ? AND (
                {not_done('t')}
                OR (s.start_date <= ? AND s.end_date >= ?))
            ORDER BY t.sort_order, t.id""",
        (user_id, today, today),
    )
    return [_row_to_task(r) for r in rows]
