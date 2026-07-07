"""Activity emission, notification fanout, mentions, reactions, search."""

from conftest import login, make_user
from test_domain import make_project, make_sprint, make_task


def test_activity_trail(admin):
    s = make_sprint(admin)
    t = make_task(admin, title="thing")
    admin.patch(f"/api/tasks/{t['id']}", json={"status": "in_progress"})
    admin.patch(f"/api/tasks/{t['id']}", json={"priority": "urgent"})
    admin.post("/api/tasks/move", json={"task_ids": [t["id"]], "sprint_id": s["id"]})
    acts = admin.get(f"/api/tasks/{t['id']}").json()["activity"]
    assert [a["type"] for a in acts] == ["created", "status_changed",
                                         "priority_changed", "sprint_moved"]
    assert acts[1]["detail"] == {"from": "todo", "to": "in_progress"}
    assert acts[3]["detail"] == {"from": None, "to": s["id"]}
    assert acts[0]["actor_username"] == "admin"


def test_notification_fanout(admin, client):
    bob = make_user(admin, "bob")
    login(client, "bob")
    t = make_task(admin, title="for bob", assignee_id=bob["id"])
    admin.patch(f"/api/tasks/{t['id']}", json={"status": "done"})
    admin.post(f"/api/tasks/{t['id']}/comments", json={"body": "done?"})
    box = client.get("/api/notifications").json()
    assert box["unread"] == 3
    types = [n["type"] for n in box["items"]]
    assert sorted(types) == ["assigned", "commented", "status_changed"]
    assert all(n["task_title"] == "for bob" for n in box["items"])

    # no self-notifications
    assert admin.get("/api/notifications").json()["unread"] == 0

    # mark one read, then all
    client.post("/api/notifications/read", json={"ids": [box["items"][0]["id"]]})
    assert client.get("/api/notifications").json()["unread"] == 2
    client.post("/api/notifications/read", json={})
    assert client.get("/api/notifications").json()["unread"] == 0


def test_mentions(admin, client):
    bob = make_user(admin, "bob")
    login(client, "bob")
    t = make_task(admin, title="x", description="ping @bob please")
    box = client.get("/api/notifications").json()
    assert [n["type"] for n in box["items"]] == ["mentioned"]

    # editing without adding a new mention does not re-notify
    admin.patch(f"/api/tasks/{t['id']}", json={"description": "ping @bob again"})
    assert client.get("/api/notifications").json()["unread"] == 1

    # mention in a project comment
    p = make_project(admin)
    admin.post(f"/api/projects/{p['id']}/comments", json={"body": "cc @bob"})
    box = client.get("/api/notifications").json()
    assert box["unread"] == 2
    assert box["items"][0]["project_title"] == "proj"


def test_reactions(admin, client):
    make_user(admin, "bob")
    login(client, "bob")
    t = make_task(admin)
    c = admin.post(f"/api/tasks/{t['id']}/comments", json={"body": "hi"}).json()
    admin.put(f"/api/comments/{c['id']}/reactions/👍")
    r = client.put(f"/api/comments/{c['id']}/reactions/👍").json()
    assert r["reactions"] == [{"emoji": "👍", "count": 2, "user_ids": [1, 2]}]
    r = client.delete(f"/api/comments/{c['id']}/reactions/👍").json()
    assert r["reactions"][0]["count"] == 1
    assert client.put(f"/api/comments/{c['id']}/reactions/🦄").status_code == 400


def test_search(admin):
    other = admin.post("/api/spaces", json={"name": "Other"}).json()
    t = make_task(admin, title="Fix the flaky login test",
                  description="pytest keeps failing on session expiry")
    make_task(admin, title="unrelated chore")
    make_task(admin, title="Fix login button color", space_id=other["id"])
    p = make_project(admin, title="Login revamp")
    admin.post(f"/api/tasks/{t['id']}/comments", json={"body": "the login fix landed"})

    r = admin.get("/api/search", params={"q": "login"}).json()
    assert {h["id"] for h in r["tasks"]} == {t["id"], 3}
    assert [h["id"] for h in r["projects"]] == [p["id"]]
    assert len(r["comments"]) == 1
    assert "<mark>login</mark>" in r["comments"][0]["snippet"]

    # space scoping and prefix matching
    r = admin.get("/api/search", params={"q": "logi", "space_id": 1}).json()
    assert {h["id"] for h in r["tasks"]} == {t["id"]}
    # updated description leaves the index consistent
    admin.patch(f"/api/tasks/{t['id']}", json={"description": "resolved"})
    r = admin.get("/api/search", params={"q": "expiry"}).json()
    assert r["tasks"] == []
    # no crash on FTS syntax characters
    assert admin.get("/api/search", params={"q": '"(unbalanced OR'}).status_code == 200
