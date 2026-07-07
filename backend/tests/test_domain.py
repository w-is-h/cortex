"""CRUD matrix for spaces, sprints, projects, tasks, blockers, comments, bulk move."""

from datetime import date, timedelta


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def make_sprint(c, space_id=1, name="Sprint 1", start=None, end=None):
    r = c.post("/api/sprints", json={"space_id": space_id, "name": name,
                                     "start_date": start or day(-1),
                                     "end_date": end or day(5)})
    assert r.status_code == 200, r.text
    return r.json()


def make_task(c, title="task", space_id=1, **kwargs):
    r = c.post("/api/tasks", json={"space_id": space_id, "title": title, **kwargs})
    assert r.status_code == 200, r.text
    return r.json()


def make_project(c, title="proj", space_id=1, due="2026-08-01", **kwargs):
    r = c.post("/api/projects", json={"space_id": space_id, "title": title,
                                      "due_date": due, **kwargs})
    assert r.status_code == 200, r.text
    return r.json()


def test_status_vocabulary(admin):
    # statuses are fixed in code: served read-only, enforced on write
    defs = admin.get("/api/statuses", params={"space_id": 1}).json()
    # tasks and projects share one lifecycle
    for kind in ("task", "project"):
        assert [d["key"] for d in defs if d["kind"] == kind] == [
            "todo", "in_progress", "done"]
    assert admin.post("/api/statuses", json={}).status_code == 405
    assert admin.post("/api/tasks", json={
        "space_id": 1, "title": "x", "status": "banana"}).status_code == 422
    t = make_task(admin)
    assert admin.patch(f"/api/tasks/{t['id']}", json={"status": "banana"}).status_code == 422


def test_spaces(admin):
    r = admin.get("/api/spaces")
    assert [s["name"] for s in r.json()] == ["General"]
    space = admin.post("/api/spaces", json={"name": "Engineering"}).json()
    admin.patch(f"/api/spaces/{space['id']}", json={"name": "Eng"})
    assert admin.get("/api/spaces").json()[1]["name"] == "Eng"


def test_sprint_crud_and_current(admin):
    s = make_sprint(admin)
    assert s["is_current"] is True
    old = make_sprint(admin, name="past", start=day(-30), end=day(-24))
    assert old["is_current"] is False
    assert old["archived"] is True  # auto: end + 7d passed
    r = admin.patch(f"/api/sprints/{old['id']}", json={"archived": False}).json()
    assert r["archived"] is False  # manual override beats auto
    assert admin.post("/api/sprints", json={
        "space_id": 1, "name": "bad", "start_date": day(3), "end_date": day(-3)
    }).status_code == 400
    listed = admin.get("/api/sprints", params={"space_id": 1}).json()
    assert len(listed) == 2


def test_sprint_delete_moves_tasks_to_backlog(admin):
    s = make_sprint(admin)
    t = make_task(admin, sprint_id=s["id"])
    admin.delete(f"/api/sprints/{s['id']}")
    assert admin.get(f"/api/tasks/{t['id']}").json()["sprint_id"] is None


def test_task_crud(admin):
    t = make_task(admin, title="write docs", description="some *md*", priority="high")
    assert t["status"] == "todo" and t["priority"] == "high"
    r = admin.patch(f"/api/tasks/{t['id']}",
                    json={"status": "in_progress", "assignee_id": 1})
    assert r.json()["status"] == "in_progress"
    assert r.json()["assignee_id"] == 1
    assert admin.patch(f"/api/tasks/{t['id']}", json={"assignee_id": 999}).status_code == 404
    assert admin.delete(f"/api/tasks/{t['id']}").status_code == 200
    assert admin.get(f"/api/tasks/{t['id']}").status_code == 404


def test_task_space_validation(admin):
    other = admin.post("/api/spaces", json={"name": "Other"}).json()
    sprint_other = make_sprint(admin, space_id=other["id"])
    # task in space 1 cannot enter a sprint of another space
    assert admin.post("/api/tasks", json={
        "space_id": 1, "title": "x", "sprint_id": sprint_other["id"]
    }).status_code == 409
    t = make_task(admin)
    assert admin.patch(f"/api/tasks/{t['id']}",
                       json={"sprint_id": sprint_other["id"]}).status_code == 409


def test_task_filters(admin, client):
    from conftest import make_user, login
    bob = make_user(admin, "bob")
    s = make_sprint(admin)
    t1 = make_task(admin, title="a", sprint_id=s["id"], assignee_id=bob["id"])
    t2 = make_task(admin, title="b", sprint_id=s["id"], status="done")
    t3 = make_task(admin, title="c")  # backlog
    ids = lambda r: [t["id"] for t in r.json()]
    assert ids(admin.get("/api/tasks", params={"sprint_id": s["id"]})) == [t1["id"], t2["id"]]
    assert ids(admin.get("/api/tasks", params={"space_id": 1, "backlog": True})) == [t3["id"]]
    assert ids(admin.get("/api/tasks", params={"status": "done"})) == [t2["id"]]
    assert ids(admin.get("/api/tasks", params={"assignee_id": bob["id"]})) == [t1["id"]]


def test_bulk_move(admin):
    s1 = make_sprint(admin, name="s1")
    s2 = make_sprint(admin, name="s2", start=day(6), end=day(12))
    t1 = make_task(admin, sprint_id=s1["id"])
    t2 = make_task(admin, sprint_id=s1["id"])
    t3 = make_task(admin)
    moved = admin.post("/api/tasks/move", json={
        "task_ids": [t1["id"], t2["id"], t3["id"]], "sprint_id": s2["id"]}).json()
    assert all(t["sprint_id"] == s2["id"] for t in moved)
    # and back to backlog
    moved = admin.post("/api/tasks/move", json={
        "task_ids": [t1["id"]], "sprint_id": None}).json()
    assert moved[0]["sprint_id"] is None


def test_blockers_and_cycles(admin):
    a = make_task(admin, title="a")
    b = make_task(admin, title="b")
    c = make_task(admin, title="c")
    assert admin.put(f"/api/tasks/{b['id']}/blockers/{a['id']}").json()["blocked"] is True
    admin.put(f"/api/tasks/{c['id']}/blockers/{b['id']}")
    # a -> b -> c; c blocking a would close the cycle
    assert admin.put(f"/api/tasks/{a['id']}/blockers/{c['id']}").status_code == 409
    assert admin.put(f"/api/tasks/{a['id']}/blockers/{a['id']}").status_code == 409
    detail = admin.get(f"/api/tasks/{b['id']}").json()
    assert [t["id"] for t in detail["blockers"]] == [a["id"]]
    assert [t["id"] for t in detail["blocking"]] == [c["id"]]
    # finishing the blocker unblocks
    admin.patch(f"/api/tasks/{a['id']}", json={"status": "done"})
    assert admin.get(f"/api/tasks/{b['id']}").json()["blocked"] is False
    # removing works
    admin.delete(f"/api/tasks/{c['id']}/blockers/{b['id']}")
    assert admin.get(f"/api/tasks/{c['id']}").json()["blockers"] == []


def test_projects(admin):
    p = make_project(admin, title="Launch", due="2026-09-01")
    make_task(admin, project_id=p["id"])
    make_task(admin, project_id=p["id"], status="done")
    got = admin.get(f"/api/projects/{p['id']}").json()
    assert got["open_tasks"] == 1 and got["total_tasks"] == 2
    assert len(got["tasks"]) == 2
    admin.patch(f"/api/projects/{p['id']}", json={"archived": True})
    assert admin.get("/api/projects", params={"space_id": 1}).json() == []
    assert len(admin.get("/api/projects",
                         params={"space_id": 1, "include_archived": True}).json()) == 1
    # stream projects have no due date; the lifecycle default is todo
    stream = admin.post("/api/projects", json={"space_id": 1, "title": "maintenance"}).json()
    assert stream["due_date"] is None and stream["status"] == "todo"


def test_project_tags(admin):
    p = make_project(admin, title="deploy", tags=["#Live", "Client ACME", "live"])
    assert p["tags"] == ["live", "client-acme"]  # normalized, deduped, ordered
    make_project(admin, title="other", tags=["live"])
    make_project(admin, title="untagged")
    both = admin.get("/api/projects", params={"space_id": 1, "tags": ["live"]}).json()
    assert len(both) == 2
    # AND semantics: both tags must be present
    one = admin.get("/api/projects",
                    params={"space_id": 1, "tags": ["live", "client-acme"]}).json()
    assert [x["id"] for x in one] == [p["id"]]
    cleared = admin.patch(f"/api/projects/{p['id']}", json={"tags": []}).json()
    assert cleared["tags"] == []


def test_guards(admin):
    done = make_project(admin, title="shipped", status="done")
    assert admin.post("/api/tasks", json={
        "space_id": 1, "title": "x", "project_id": done["id"]}).status_code == 409
    archived = make_project(admin, title="old")
    admin.patch(f"/api/projects/{archived['id']}", json={"archived": True})
    t = make_task(admin)
    assert admin.patch(f"/api/tasks/{t['id']}",
                       json={"project_id": archived["id"]}).status_code == 409
    old_sprint = make_sprint(admin, name="ancient", start=day(-30), end=day(-24))
    assert admin.post("/api/tasks/move", json={
        "task_ids": [t["id"]], "sprint_id": old_sprint["id"]}).status_code == 409
    other = admin.post("/api/spaces", json={"name": "Elsewhere"}).json()
    foreign = make_task(admin, space_id=other["id"])
    assert admin.put(f"/api/tasks/{t['id']}/blockers/{foreign['id']}").status_code == 409


def test_comments_on_both_parents(admin, client):
    from conftest import make_user, login
    bob = make_user(admin, "bob")
    login(client, "bob")
    t = make_task(admin)
    p = make_project(admin)
    c1 = client.post(f"/api/tasks/{t['id']}/comments", json={"body": "on task"}).json()
    c2 = client.post(f"/api/projects/{p['id']}/comments", json={"body": "on project"}).json()
    assert c1["author_username"] == "bob"
    assert admin.get(f"/api/tasks/{t['id']}").json()["comments"][0]["body"] == "on task"
    assert admin.get(f"/api/projects/{p['id']}").json()["comments"][0]["body"] == "on project"
    # admin may delete bob's comment
    assert admin.delete(f"/api/comments/{c1['id']}").status_code == 200
    # bob cannot delete admin's comment
    c3 = admin.post(f"/api/tasks/{t['id']}/comments", json={"body": "admin says"}).json()
    assert client.delete(f"/api/comments/{c3['id']}").status_code == 403


def test_my_tasks(admin, client):
    from conftest import make_user, login
    bob = make_user(admin, "bob")
    login(client, "bob")
    s = make_sprint(admin)  # current sprint
    make_task(admin, title="mine-open", assignee_id=bob["id"])
    make_task(admin, title="mine-current-done", assignee_id=bob["id"],
              sprint_id=s["id"], status="done")
    make_task(admin, title="not-mine")
    make_task(admin, title="mine-old-done", status="done", assignee_id=bob["id"])
    titles = {t["title"] for t in client.get("/api/me/tasks").json()}
    assert titles == {"mine-open", "mine-current-done"}
