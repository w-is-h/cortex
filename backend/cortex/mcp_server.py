"""MCP server for agents: curated tools over the same service layer as REST.

Mounted at /mcp (stateless streamable HTTP, JSON responses), authenticated by
the same ck_* API keys as the REST API. The tool set is deliberately small:
the verbs an agent actually performs, plus one workspace call for context.
"""

import json
from contextvars import ContextVar
from datetime import date
from typing import Literal

from mcp.server.fastmcp import FastMCP

from . import db
from .auth import User, user_from_api_key
from .models import Priority
from .services import (comments, notifications, projects,
                       search as search_service, spaces, sprints, tasks, users)
from .statuses import STATUSES, Status

CURRENT_USER: ContextVar[User | None] = ContextVar("cortex_mcp_user", default=None)


def current_user() -> User:
    user = CURRENT_USER.get()
    assert user is not None, "ApiKeyAuthMiddleware must set the user"
    return user


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
            with db.transaction() as conn:
                user = user_from_api_key(conn, auth.removeprefix("Bearer "))
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

def get_workspace() -> dict:
    """Everything needed to orient: who you are, all spaces, all users, the status
    vocabulary (tasks and projects share one lifecycle: todo/in_progress/done), and
    the project tags in use. Call this first — it resolves the ids and keys every
    other tool expects."""
    me = current_user()
    with db.transaction() as conn:
        rows = conn.execute("SELECT tags FROM projects WHERE tags != ''")
        return {
            "you": {"id": me.id, "username": me.username, "is_admin": me.is_admin},
            "spaces": spaces.list_spaces(conn),
            "users": users.list_users(conn),
            "statuses": STATUSES,
            "project_tags": sorted({t for r in rows for t in r["tags"].split()}),
        }


def list_sprints(space_id: int) -> list[dict]:
    """List a space's sprints, newest first. is_current marks the sprint covering today;
    archived marks sprints past their end date + 7 days (or manually archived)."""
    with db.transaction() as conn:
        return sprints.list_sprints(conn, space_id)


def create_sprint(space_id: int, name: str, start_date: str, end_date: str) -> dict:
    """Create a sprint. Dates are ISO YYYY-MM-DD; sprints are typically 1-2 weeks."""
    with db.transaction() as conn:
        return sprints.create(conn, space_id, name,
                              date.fromisoformat(start_date), date.fromisoformat(end_date))


def update_sprint(sprint_id: int, name: str | None = None, start_date: str | None = None,
                  end_date: str | None = None, archived: bool | None = None) -> dict:
    """Update a sprint: rename, change dates (ISO YYYY-MM-DD), or archive/unarchive it.
    Only the fields you pass change."""
    fields = {k: v for k, v in {"name": name, "start_date": start_date,
                                "end_date": end_date, "archived": archived}.items() if v is not None}
    with db.transaction() as conn:
        return sprints.update(conn, sprint_id, **fields)


def list_tasks(space_id: int | None = None, sprint_id: int | None = None,
               backlog: bool = False, status: Status | None = None,
               assignee_id: int | None = None, project_id: int | None = None) -> list[dict]:
    """List tasks with optional filters. backlog=true selects tasks in no sprint.
    Combine filters, e.g. space_id + backlog, or sprint_id + status."""
    with db.transaction() as conn:
        return tasks.list_tasks(conn, space_id=space_id, sprint_id=sprint_id,
                                backlog=backlog, status=status,
                                assignee_id=assignee_id, project_id=project_id)


def get_task(task_id: int | None = None, ref: str | None = None) -> dict:
    """Get a task's full picture: description (markdown), comments with reactions,
    activity trail, and which tasks block it / it blocks. Pass task_id, or ref
    for an external cx-XXXXXXXXX reference (as seen in GitHub or chat)."""
    with db.transaction() as conn:
        task = tasks.get_by_ref(conn, ref) if ref else tasks.get(conn, task_id)
        return tasks.detail(conn, task)


def create_task(space_id: int, title: str, description: str = "",
                status: Status = "todo", priority: Priority = "medium",
                assignee_id: int | None = None, sprint_id: int | None = None,
                project_id: int | None = None) -> dict:
    """Create a task. description is markdown. Omit sprint_id to create it in the
    backlog. priority is low|medium|high|urgent. Mention users as @username to
    notify them."""
    with db.transaction() as conn:
        return tasks.create(conn, current_user(), {
            "space_id": space_id, "title": title, "description": description,
            "status": status, "priority": priority, "assignee_id": assignee_id,
            "sprint_id": sprint_id, "project_id": project_id})


ClearableTaskField = Literal["assignee_id", "project_id", "description"]


def update_task(task_id: int, title: str | None = None, description: str | None = None,
                status: Status | None = None, priority: Priority | None = None,
                assignee_id: int | None = None, project_id: int | None = None,
                clear: list[ClearableTaskField] | None = None) -> dict:
    """Update a task; only the fields you pass change. To empty a field (unassign,
    detach from project, blank the description), name it in `clear` instead —
    e.g. clear=["assignee_id"]. Use move_tasks to change sprints."""
    fields = {k: v for k, v in {"title": title, "description": description,
                                "status": status, "priority": priority,
                                "assignee_id": assignee_id, "project_id": project_id}.items()
              if v is not None}
    for key in clear or []:
        fields[key] = "" if key == "description" else None
    with db.transaction() as conn:
        return tasks.update(conn, current_user(), task_id, fields)


def delete_task(task_id: int) -> dict:
    """Delete a task permanently, along with its comments, activity and blocker links."""
    with db.transaction() as conn:
        tasks.delete(conn, current_user(), task_id)
        return {"ok": True}


def move_tasks(task_ids: list[int], sprint_id: int | None = None) -> list[dict]:
    """Move one or many tasks into a sprint, or into the backlog (sprint_id=null).
    This is the way to carry unfinished work over when a sprint ends."""
    with db.transaction() as conn:
        return tasks.move_to_sprint(conn, current_user(), task_ids, sprint_id)


def add_blocker(task_id: int, blocker_id: int) -> dict:
    """Mark that task_id is blocked by blocker_id. Rejects cycles."""
    with db.transaction() as conn:
        return tasks.add_blocker(conn, current_user(), task_id, blocker_id)


def remove_blocker(task_id: int, blocker_id: int) -> dict:
    """Remove a blocking relation from task_id."""
    with db.transaction() as conn:
        return tasks.remove_blocker(conn, current_user(), task_id, blocker_id)


def add_comment(parent_type: Literal["task", "project"], parent_id: int, body: str) -> dict:
    """Comment on a task or project. body is markdown; @username mentions notify."""
    with db.transaction() as conn:
        return comments.create(conn, current_user(), parent_type, parent_id, body)


def update_comment(comment_id: int, body: str) -> dict:
    """Edit one of your own comments (admins may edit any). body is markdown."""
    with db.transaction() as conn:
        return comments.update(conn, current_user(), comment_id, body)


def list_projects(space_id: int, include_archived: bool = False,
                  tags: list[str] | None = None) -> list[dict]:
    """List a space's projects with tags, due dates and open/total task counts.
    tags filters with AND semantics: every named tag must be present."""
    with db.transaction() as conn:
        return projects.list_projects(conn, space_id, include_archived, tags=tags)


def get_project(project_id: int) -> dict:
    """Get a project with its description, comments and tasks."""
    with db.transaction() as conn:
        return projects.detail(conn, projects.get(conn, project_id))


def create_project(space_id: int, title: str, description: str = "",
                   due_date: str | None = None, start_date: str | None = None,
                   owner_id: int | None = None, status: Status = "todo",
                   tags: list[str] | None = None) -> dict:
    """Create a project. Deliverables get a due_date (YYYY-MM-DD, shows on the
    timeline); ongoing/stream projects omit it. tags are freeform lowercase labels
    (e.g. ['live', 'client-acme']) — see get_workspace for the vocabulary in use."""
    with db.transaction() as conn:
        return projects.create(conn, current_user(), {
            "space_id": space_id, "title": title, "description": description,
            "due_date": due_date, "start_date": start_date,
            "owner_id": owner_id, "status": status, "tags": tags or []})


ClearableProjectField = Literal["owner_id", "start_date", "due_date", "description"]


def update_project(project_id: int, title: str | None = None, description: str | None = None,
                   due_date: str | None = None, start_date: str | None = None,
                   owner_id: int | None = None, status: Status | None = None,
                   tags: list[str] | None = None, archived: bool | None = None,
                   clear: list[ClearableProjectField] | None = None) -> dict:
    """Update a project; only the fields you pass change. tags replaces the whole
    tag set (pass [] to remove all). To empty another field, name it in `clear` —
    e.g. clear=["owner_id"]."""
    fields = {k: v for k, v in {"title": title, "description": description,
                                "due_date": due_date, "start_date": start_date,
                                "owner_id": owner_id, "status": status, "tags": tags,
                                "archived": archived}.items() if v is not None}
    for key in clear or []:
        fields[key] = "" if key == "description" else None
    with db.transaction() as conn:
        return projects.update(conn, current_user(), project_id, fields)


def search(q: str, space_id: int | None = None,
           kinds: list[Literal["task", "project", "comment"]] | None = None,
           status: Status | None = None, has_images: bool = False) -> dict:
    """Full-text search across task titles/descriptions, projects and comments.
    Prefix matching: 'auth' finds 'authentication'. Filters (all optional):
    kinds limits result types (e.g. ['comment'] = comments only); status filters
    task hits; has_images keeps only items whose markdown embeds an image."""
    with db.transaction() as conn:
        return search_service.search(conn, q, space_id, kinds=kinds,
                                     status=status, has_images=has_images)


def list_notifications() -> dict:
    """Catch up: your unread count and recent notifications (assignments, status
    changes, comments on your tasks, @mentions of you). Everything returned is
    marked read — one call closes the loop."""
    with db.transaction() as conn:
        out = notifications.list_for_user(conn, current_user().id)
        notifications.mark_read(conn, current_user().id)
        return out


TOOLS = [get_workspace, list_sprints, create_sprint, update_sprint,
         list_tasks, get_task, create_task, update_task, delete_task, move_tasks,
         add_blocker, remove_blocker, add_comment, update_comment,
         list_projects, get_project, create_project, update_project,
         search, list_notifications]


def build_mcp() -> FastMCP:
    """Fresh instance per app — a FastMCP session manager can only run once."""
    mcp = FastMCP("cortex", stateless_http=True, json_response=True,
                  streamable_http_path="/")
    for fn in TOOLS:
        mcp.add_tool(fn)
    return mcp


def mcp_asgi_app(mcp: FastMCP):
    return ApiKeyAuthMiddleware(mcp.streamable_http_app())
