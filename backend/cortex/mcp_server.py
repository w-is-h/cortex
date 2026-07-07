"""MCP server for agents: curated tools over the same service layer as REST.

Mounted at /mcp (stateless streamable HTTP, JSON responses), authenticated by
the same ck_* API keys as the REST API.
"""

import json
import re
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date
from typing import Literal

from mcp.server.fastmcp import FastMCP

from . import db
from .auth import User, hash_key, now
from .models import Priority, Status
from .services import (comments, notifications, projects, search as search_service,
                       spaces, sprints, statuses as statuses_service, tasks, users)

CURRENT_USER: ContextVar[User | None] = ContextVar("cortex_mcp_user", default=None)


def current_user() -> User:
    user = CURRENT_USER.get()
    assert user is not None, "ApiKeyAuthMiddleware must set the user"
    return user


@contextmanager
def _db():
    conn = db.connect()
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


class ApiKeyAuthMiddleware:
    """ASGI wrapper: resolve Bearer ck_* against api_keys or reject with 401."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        auth = ""
        for name, value in scope["headers"]:
            if name == b"authorization":
                auth = value.decode()
        user = None
        if auth.startswith("Bearer ck_"):
            key = auth.removeprefix("Bearer ")
            conn = db.connect()
            try:
                row = conn.execute(
                    """SELECT u.id, u.username, u.is_admin FROM api_keys k
                       JOIN users u ON u.id = k.user_id
                       WHERE k.key_hash = ? AND u.is_active = 1""",
                    (hash_key(key),),
                ).fetchone()
                if row is not None:
                    conn.execute("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?",
                                 (now(), hash_key(key)))
                    conn.commit()
                    user = User(row["id"], row["username"], bool(row["is_admin"]))
            finally:
                conn.close()
        if user is None:
            body = json.dumps({"detail": "valid 'Authorization: Bearer ck_...' required"})
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body.encode()})
            return
        token = CURRENT_USER.set(user)
        try:
            await self.app(scope, receive, send)
        finally:
            CURRENT_USER.reset(token)


# ---------------------------------------------------------------- tools

def list_spaces() -> list[dict]:
    """List all spaces (the top-level containers for sprints, tasks and projects)."""
    with _db() as conn:
        return spaces.list_spaces(conn)


def list_users() -> list[dict]:
    """List all users. Call this to resolve usernames to ids for assignees."""
    with _db() as conn:
        return users.list_users(conn)


def list_statuses(space_id: int, kind: Literal["task", "project"] | None = None) -> list[dict]:
    """List a space's status columns. Statuses are per-space and user-defined, so ALWAYS
    call this to learn the valid status `key`s before setting a task's or project's status.
    kind='task' or 'project' filters; each status has key, label, color, sort_order and
    is_done (a task/project with an is_done status counts as complete)."""
    with _db() as conn:
        return statuses_service.list_statuses(conn, space_id, kind)


def list_sprints(space_id: int) -> list[dict]:
    """List a space's sprints, newest first. is_current marks the sprint covering today;
    archived marks sprints past their end date + 7 days (or manually archived)."""
    with _db() as conn:
        return sprints.list_sprints(conn, space_id)


def create_sprint(space_id: int, name: str, start_date: str, end_date: str) -> dict:
    """Create a sprint. Dates are ISO YYYY-MM-DD; sprints are typically 1-2 weeks."""
    with _db() as conn:
        return sprints.create(conn, space_id, name,
                              date.fromisoformat(start_date), date.fromisoformat(end_date))


def update_sprint(sprint_id: int, name: str | None = None, start_date: str | None = None,
                  end_date: str | None = None, archived: bool | None = None) -> dict:
    """Update a sprint: rename, change dates (ISO YYYY-MM-DD), or archive/unarchive it.
    Only the fields you pass change."""
    fields = {k: v for k, v in {"name": name, "start_date": start_date,
                                "end_date": end_date, "archived": archived}.items() if v is not None}
    with _db() as conn:
        return sprints.update(conn, sprint_id, **fields)


def delete_sprint(sprint_id: int) -> dict:
    """Delete a sprint. Its tasks are moved to the backlog (not deleted)."""
    with _db() as conn:
        sprints.delete(conn, sprint_id)
        return {"ok": True}


def list_tasks(space_id: int | None = None, sprint_id: int | None = None,
               backlog: bool = False, status: Status | None = None,
               assignee_id: int | None = None, project_id: int | None = None) -> list[dict]:
    """List tasks with optional filters. backlog=true selects tasks in no sprint.
    Combine filters, e.g. space_id + backlog, or sprint_id + status."""
    with _db() as conn:
        return tasks.list_tasks(conn, space_id=space_id, sprint_id=sprint_id,
                                backlog=backlog, status=status,
                                assignee_id=assignee_id, project_id=project_id)


def get_task(task_id: int) -> dict:
    """Get a task's full picture: description (markdown), comments with reactions,
    activity trail, and which tasks block it / it blocks."""
    with _db() as conn:
        from .services import activity as activity_service
        task = tasks.get(conn, task_id)
        task["comments"] = comments.list_for(conn, "task", task_id)
        task["activity"] = activity_service.list_for_task(conn, task_id)
        task["blockers"] = tasks.blockers_of(conn, task_id)
        task["blocking"] = tasks.blocking(conn, task_id)
        return task


def create_task(space_id: int, title: str, description: str = "",
                status: Status = "todo", priority: Priority = "medium",
                assignee_id: int | None = None, sprint_id: int | None = None,
                project_id: int | None = None) -> dict:
    """Create a task. description is markdown. Omit sprint_id to create it in the backlog.
    `status` is a status key from list_statuses(space_id, 'task') — defaults to 'todo'.
    priority is low|medium|high|urgent. Mention users as @username to notify them."""
    with _db() as conn:
        return tasks.create(conn, current_user(), {
            "space_id": space_id, "title": title, "description": description,
            "status": status, "priority": priority, "assignee_id": assignee_id,
            "sprint_id": sprint_id, "project_id": project_id})


def update_task(task_id: int, title: str | None = None, description: str | None = None,
                status: Status | None = None, priority: Priority | None = None,
                assignee_id: int | None = None, project_id: int | None = None) -> dict:
    """Update a task; only the fields you pass change. Use move_tasks to change sprints.
    `status` is a key from list_statuses(space_id, 'task'). assignee_id=null unassigns."""
    fields = {k: v for k, v in {"title": title, "description": description,
                                "status": status, "priority": priority,
                                "assignee_id": assignee_id, "project_id": project_id}.items()
              if v is not None}
    with _db() as conn:
        return tasks.update(conn, current_user(), task_id, fields)


def delete_task(task_id: int) -> dict:
    """Delete a task permanently, along with its comments, activity and blocker links."""
    with _db() as conn:
        tasks.delete(conn, current_user(), task_id)
        return {"ok": True}


def grep_tasks(pattern: str, space_id: int | None = None,
               ignore_case: bool = True) -> list[dict]:
    """Regex search over task titles + descriptions (Python `re` syntax). Use this for
    precise/structural matches that full-text `search` can't do (e.g. r'TODO:|FIXME',
    r'@\\w+', version strings). Returns matching tasks. Prefer `search` for fuzzy prose."""
    flags = re.IGNORECASE if ignore_case else 0
    rx = re.compile(pattern, flags)
    with _db() as conn:
        rows = tasks.list_tasks(conn, space_id=space_id)
        return [t for t in rows if rx.search(t["title"]) or rx.search(t.get("description") or "")]


def move_tasks(task_ids: list[int], sprint_id: int | None = None) -> list[dict]:
    """Move one or many tasks into a sprint, or into the backlog (sprint_id=null).
    This is the way to carry unfinished work over when a sprint ends."""
    with _db() as conn:
        return tasks.move_to_sprint(conn, current_user(), task_ids, sprint_id)


def add_comment(parent_type: Literal["task", "project"], parent_id: int, body: str) -> dict:
    """Comment on a task or project. body is markdown; @username mentions notify."""
    with _db() as conn:
        return comments.create(conn, current_user(), parent_type, parent_id, body)


def update_comment(comment_id: int, body: str) -> dict:
    """Edit one of your own comments (admins may edit any). body is markdown."""
    with _db() as conn:
        return comments.update(conn, current_user(), comment_id, body)


def delete_comment(comment_id: int) -> dict:
    """Delete one of your own comments (admins may delete any)."""
    with _db() as conn:
        comments.delete(conn, current_user(), comment_id)
        return {"ok": True}


def add_reaction(comment_id: int, emoji: str) -> dict:
    """React to a comment. One of: 👍 👎 ❤️ 🎉 😄 🚀 👀"""
    with _db() as conn:
        return comments.add_reaction(conn, current_user(), comment_id, emoji)


def add_blocker(task_id: int, blocker_id: int) -> dict:
    """Mark that task_id is blocked by blocker_id. Rejects cycles."""
    with _db() as conn:
        return tasks.add_blocker(conn, current_user(), task_id, blocker_id)


def remove_blocker(task_id: int, blocker_id: int) -> dict:
    """Remove a blocking relation from task_id."""
    with _db() as conn:
        return tasks.remove_blocker(conn, current_user(), task_id, blocker_id)


def list_projects(space_id: int, include_archived: bool = False) -> list[dict]:
    """List a space's projects with due dates and open/total task counts."""
    with _db() as conn:
        return projects.list_projects(conn, space_id, include_archived)


def get_project(project_id: int) -> dict:
    """Get a project with its description, comments and tasks."""
    with _db() as conn:
        project = projects.get(conn, project_id)
        project["comments"] = comments.list_for(conn, "project", project_id)
        project["tasks"] = tasks.list_tasks(conn, project_id=project_id)
        return project


def create_project(space_id: int, title: str, due_date: str, description: str = "",
                   start_date: str | None = None, owner_id: int | None = None,
                   status: str | None = None) -> dict:
    """Create a project. due_date (YYYY-MM-DD) is required; start_date shows on the timeline.
    owner_id assigns an owning user; `status` is a key from list_statuses(space_id, 'project')."""
    with _db() as conn:
        return projects.create(conn, current_user(), {
            "space_id": space_id, "title": title, "description": description,
            "due_date": due_date, "start_date": start_date,
            "owner_id": owner_id, "status": status})


def update_project(project_id: int, title: str | None = None, description: str | None = None,
                   due_date: str | None = None, start_date: str | None = None,
                   owner_id: int | None = None, status: str | None = None,
                   archived: bool | None = None) -> dict:
    """Update a project; only the fields you pass change. `status` is a key from
    list_statuses(space_id, 'project'); owner_id assigns the owning user."""
    fields = {k: v for k, v in {"title": title, "description": description,
                                "due_date": due_date, "start_date": start_date,
                                "owner_id": owner_id, "status": status,
                                "archived": archived}.items() if v is not None}
    with _db() as conn:
        return projects.update(conn, current_user(), project_id, fields)


def search(q: str, space_id: int | None = None,
           kinds: list[Literal["task", "project", "comment"]] | None = None,
           status: str | None = None, has_images: bool = False) -> dict:
    """Full-text search across task titles/descriptions, projects and comments.
    Prefix matching: 'auth' finds 'authentication'. Filters (all optional):
    kinds limits result types (e.g. ['comment'] = comments only); status filters
    task hits to a status key (see list_statuses); has_images keeps only items whose
    markdown embeds an image. For regex/structural matches over tasks, use grep_tasks."""
    with _db() as conn:
        return search_service.search(conn, q, space_id, kinds=kinds,
                                     status=status, has_images=has_images)


def list_notifications() -> dict:
    """Your unread count and recent notifications (assignments, status changes,
    comments on your tasks, @mentions of you). Use this to catch up on what happened."""
    with _db() as conn:
        return notifications.list_for_user(conn, current_user().id)


TOOLS = [list_spaces, list_users, list_statuses, list_sprints, create_sprint,
         update_sprint, delete_sprint, list_tasks, get_task, create_task, update_task,
         delete_task, move_tasks, grep_tasks, add_comment, add_reaction, add_blocker,
         remove_blocker, list_projects, get_project, create_project, update_project,
         update_comment, delete_comment, search, list_notifications]


def build_mcp() -> FastMCP:
    """Fresh instance per app — a FastMCP session manager can only run once."""
    mcp = FastMCP("cortex", stateless_http=True, json_response=True,
                  streamable_http_path="/")
    for fn in TOOLS:
        mcp.add_tool(fn)
    return mcp


def mcp_asgi_app(mcp: FastMCP):
    return ApiKeyAuthMiddleware(mcp.streamable_http_app())
