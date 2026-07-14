"""MCP-layer logic (clear-fields, auto-mark, ref lookup, workspace assembly).

Calls the tool functions directly — protocol and auth wiring are covered by
scripts/mcp_check.py against a live server.
"""

import pytest

from conftest import make_user
from cortex import mcp_server
from cortex.auth import User


@pytest.fixture
def as_admin(app):
    token = mcp_server.CURRENT_USER.set(User(1, "admin", True))
    yield
    mcp_server.CURRENT_USER.reset(token)


def test_workspace_clear_and_ref(as_admin):
    ws = mcp_server.get_workspace()
    assert ws["you"]["id"] == 1
    assert [s["key"] for s in ws["task_statuses"]] == ["todo", "in_progress", "done"]
    assert [s["key"] for s in ws["project_statuses"]] == ["todo", "in_progress", "done"]

    p = mcp_server.create_project(space_id=1, title="deploy", tags=["#Live"])
    assert p["tags"] == ["live"] and p["due_date"] is None
    assert "live" in mcp_server.get_workspace()["project_tags"]

    t = mcp_server.create_task(space_id=1, title="x", assignee_id=1, project_id=p["id"])
    cleared = mcp_server.update_task(t["id"], clear=["assignee_id", "project_id"])
    assert cleared["assignee_id"] is None and cleared["project_id"] is None

    assert mcp_server.get_task(ref=t["ref"])["id"] == t["id"]


def test_comment_lifecycle(as_admin):
    t = mcp_server.create_task(space_id=1, title="discuss")
    c = mcp_server.add_comment("task", t["id"], "shipping today")

    reacted = mcp_server.add_reaction(c["id"], "👍")
    assert reacted["reactions"] == [{"emoji": "👍", "count": 1, "user_ids": [1]}]
    assert mcp_server.remove_reaction(c["id"], "👍")["reactions"] == []

    assert mcp_server.delete_comment(c["id"]) == {"ok": True}
    assert mcp_server.get_task(t["id"])["comments"] == []


def test_notifications_auto_marked(as_admin, admin):
    bob = make_user(admin, "bob")
    mcp_server.create_task(space_id=1, title="for bob", assignee_id=bob["id"])

    token = mcp_server.CURRENT_USER.set(User(bob["id"], "bob", False))
    try:
        assert mcp_server.list_notifications()["unread"] == 1
        assert mcp_server.list_notifications()["unread"] == 0  # reading marked it
    finally:
        mcp_server.CURRENT_USER.reset(token)
