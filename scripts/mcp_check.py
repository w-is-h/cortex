# /// script
# requires-python = ">=3.13"
# dependencies = ["mcp", "httpx"]
# ///
"""MCP round-trip check against a running cortex server.

Usage: uv run scripts/mcp_check.py [base_url]
Logs in as admin over REST, mints an API key, then drives the MCP endpoint.
"""

import asyncio
import json
import sys

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

EXPECTED_TOOLS = {
    "get_workspace", "list_sprints", "create_sprint", "update_sprint",
    "list_tasks", "get_task", "create_task", "update_task", "delete_task",
    "move_tasks", "add_blocker", "remove_blocker", "add_comment",
    "update_comment", "list_projects", "get_project", "create_project",
    "update_project", "search", "list_notifications",
}


def structured(result):
    assert not result.isError, result.content
    return json.loads(result.content[0].text)


async def main():
    with httpx.Client(base_url=BASE) as http:
        r = http.post("/api/auth/login", json={"username": "admin"})
        r.raise_for_status()
        key = http.post("/api/me/api-keys", json={"name": "mcp-check"}).json()["key"]

        # bad key must be rejected before reaching MCP
        r = http.post("/mcp", headers={"Authorization": "Bearer ck_bogus"},
                      json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        assert r.status_code == 401, f"expected 401 for bad key, got {r.status_code}"

    async with streamablehttp_client(
        f"{BASE}/mcp", headers={"Authorization": f"Bearer {key}"}
    ) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = {t.name for t in (await session.list_tools()).tools}
            missing = EXPECTED_TOOLS - tools
            assert not missing, f"missing tools: {missing}"
            extra = tools - EXPECTED_TOOLS
            assert not extra, f"unexpected tools: {extra}"

            ws = structured(await session.call_tool("get_workspace", {}))
            assert ws["you"]["username"] == "admin"
            assert [s["key"] for s in ws["statuses"]] == ["todo", "in_progress", "done"]
            assert isinstance(ws["project_tags"], list)

            sprints = structured(await session.call_tool(
                "create_sprint", {"space_id": 1, "name": "mcp sprint",
                                  "start_date": "2026-07-06", "end_date": "2026-07-12"}))
            task = structured(await session.call_tool(
                "create_task", {"space_id": 1, "title": "task from mcp_check"}))
            assert task["sprint_id"] is None

            moved = structured(await session.call_tool(
                "move_tasks", {"task_ids": [task["id"]], "sprint_id": sprints["id"]}))

            structured(await session.call_tool(
                "add_comment", {"parent_type": "task", "parent_id": task["id"],
                                "body": "hello from **mcp**"}))

            got = structured(await session.call_tool("get_task", {"ref": task["ref"]}))
            assert got["id"] == task["id"], "ref lookup failed"
            assert got["sprint_id"] == sprints["id"], "move did not stick"
            assert got["comments"][0]["body"] == "hello from **mcp**"
            assert got["comments"][0]["author_username"] == "admin"
            assert [a["type"] for a in got["activity"]] == ["created", "sprint_moved"]

            hits = structured(await session.call_tool("search", {"q": "mcp_check"}))
            assert any(t["id"] == task["id"] for t in hits["tasks"])

    print(f"mcp_check OK — {len(tools)} tools, task {task['id']} created/moved/commented")


asyncio.run(main())
