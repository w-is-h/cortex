"""Seed the cortex database with sample data for local testing / demos.

    uv run python scripts/seed.py

Creates a fresh "Demo" space each run (with users, a current sprint, a project,
and tasks + comments), so it's safe to run repeatedly. Log in as `admin`.
"""

from datetime import date, timedelta

from cortex import db
from cortex.auth import User
from cortex.services import comments, projects, spaces, sprints, statuses, tasks, users


def main() -> None:
    db.migrate()
    conn = db.connect()
    try:
        admin = User(1, "admin", True)  # seeded by the schema

        existing = {u["username"] for u in users.list_users(conn)}
        for name in ("wren", "zk", "mira"):
            if name not in existing:
                users.create(conn, name)
        conn.commit()
        uid = {u["username"]: u["id"] for u in users.list_users(conn)}

        space = spaces.create(conn, "Demo")  # spaces.create seeds default statuses
        sid = space["id"]
        conn.commit()

        task_st = [s["key"] for s in statuses.list_statuses(conn, sid, "task")]
        proj_st = [s["key"] for s in statuses.list_statuses(conn, sid, "project")]

        today = date.today()
        sprint = sprints.create(conn, sid, "Sprint 1",
                                today - timedelta(days=3), today + timedelta(days=11))
        conn.commit()

        proj = projects.create(conn, admin, {
            "space_id": sid, "title": "Launch v1",
            "description": "Ship the **MVP**.\n\n- [ ] backend\n- [ ] frontend\n- [ ] docs",
            "due_date": (today + timedelta(days=30)).isoformat(),
            "start_date": today.isoformat(),
            "owner_id": uid["zk"], "status": proj_st[0],
        })
        conn.commit()

        samples = [
            ("Set up CI", "Configure the pipeline. cc @wren", task_st[0], "high", "wren"),
            ("Design the board", "Three columns.\n\n- [x] cards\n- [ ] drag & drop", task_st[1], "medium", "zk"),
            ("Write the docs", "Cover the REST API and MCP tools.", task_st[0], "low", None),
            ("Fix the login bug", "Session drops on refresh — @mira take a look.", task_st[1], "urgent", "mira"),
            ("Ship it", "Final release checklist.", task_st[-1], "medium", "zk"),
        ]
        made = []
        for title, desc, st, prio, who in samples:
            made.append(tasks.create(conn, admin, {
                "space_id": sid, "title": title, "description": desc,
                "status": st, "priority": prio, "assignee_id": uid.get(who),
                "sprint_id": sprint["id"], "project_id": proj["id"],
            }))
        conn.commit()

        comments.create(conn, User(uid["wren"], "wren", False), "task", made[0]["id"],
                        "On it — @zk anything specific?")
        comments.create(conn, admin, "project", proj["id"], "Kickoff notes below.")
        conn.commit()

        print(f"seeded space '{space['name']}' (id {sid}): "
              f"{len(made)} tasks, 1 project, 1 sprint, 3 users")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
