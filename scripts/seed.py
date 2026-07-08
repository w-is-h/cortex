"""Seed the cortex database with a realistic demo workspace.

    uv run python scripts/seed.py

Meant for an empty database (wipe data/cortex.db first): 10 users, 3 spaces,
15 projects, 5 sprints (archived through current) and 100 tasks, plus a
scattering of comments, mentions and blockers. Deterministic (seeded RNG),
safe to re-run — users are reused, spaces are created fresh. Log in as `admin`.
"""

import random
from datetime import date, timedelta

from cortex import db
from cortex.auth import User
from cortex.services import comments, projects, spaces, sprints, tasks, users

rng = random.Random(7)
TODAY = date.today()


def day(offset: int) -> date:
    return TODAY + timedelta(days=offset)


USERNAMES = ["zk", "wren", "mira", "tomas", "elena",
             "priya", "dario", "june", "noah", "sofia"]

SPACES = ["Engineering", "Product", "Ops"]

# space, name, start/end day offsets, archive after seeding
SPRINTS = [
    ("Engineering", "Sprint 21", -42, -29, True),
    ("Engineering", "Sprint 22", -28, -15, True),
    ("Engineering", "Sprint 23", -3, 11, False),
    ("Product", "Cycle 7", -16, -2, False),
    ("Product", "Cycle 8", -1, 13, False),
]

# space, title, tags, due offset (None = ongoing stream), final status, archived
PROJECTS = [
    ("Engineering", "API v2", ["backend", "api"], 21, "in_progress", False),
    ("Engineering", "Realtime sync", ["backend", "infra"], 45, "in_progress", False),
    ("Engineering", "Design system", ["frontend", "design"], None, "in_progress", False),
    ("Engineering", "Mobile app", ["frontend", "mobile"], 90, "todo", False),
    ("Engineering", "CI overhaul", ["infra"], -7, "done", False),
    ("Engineering", "Search relevance", ["backend", "search"], 30, "in_progress", False),
    ("Engineering", "Reliability", ["infra", "on-call"], None, "in_progress", False),
    ("Product", "Q3 roadmap", ["planning"], 14, "in_progress", False),
    ("Product", "Onboarding revamp", ["growth", "design"], 25, "in_progress", False),
    ("Product", "Pricing experiments", ["growth"], 40, "todo", False),
    ("Product", "Customer interviews", ["research"], None, "in_progress", False),
    ("Product", "Beta program", ["growth", "beta"], -14, "done", True),
    ("Ops", "SOC2", ["compliance"], 60, "in_progress", False),
    ("Ops", "Hiring: backend", ["hiring"], None, "in_progress", False),
    ("Ops", "Office move", ["facilities"], 35, "todo", False),
]

# space, sprint (None = backlog), task count, status profile
BATCHES = [
    ("Engineering", "Sprint 21", 15, "old"),
    ("Engineering", "Sprint 22", 15, "old"),
    ("Engineering", "Sprint 23", 15, "current"),
    ("Engineering", None, 10, "backlog"),
    ("Product", "Cycle 7", 10, "old"),
    ("Product", "Cycle 8", 12, "current"),
    ("Product", None, 8, "backlog"),
    ("Ops", None, 15, "current"),
]

TITLES = {
    "Engineering": (
        ["Fix pagination in", "Add rate limits to", "Refactor", "Write tests for",
         "Profile slow queries in", "Instrument", "Document", "Handle errors in",
         "Polish empty states in", "Cache"],
        ["auth", "billing", "search", "the editor", "the API", "webhooks",
         "exports", "notifications", "the board", "the timeline"],
    ),
    "Product": (
        ["Draft spec for", "User-test", "Review copy for", "Prioritize feedback on",
         "Sketch flows for", "Measure activation of"],
        ["onboarding", "the pricing page", "invites", "digest emails",
         "mobile signup", "the trial flow", "the dashboard", "settings"],
    ),
    "Ops": (
        ["Collect evidence for", "Schedule", "Update the policy on",
         "Negotiate", "Prepare"],
        ["access reviews", "vendor renewals", "laptop provisioning",
         "background checks", "the office lease", "the team offsite"],
    ),
}

DESCRIPTIONS = [
    "Scope in the linked doc.\n\n- [ ] draft\n- [ ] review\n- [ ] ship",
    "Repro is intermittent — check the logs first.",
    "Waiting on a decision from @{mention}, ping them if it drags.",
    "Same pattern as last time, should be quick.",
    "Needs a migration — read AGENTS.md before touching the schema.",
    "**Goal:** measurable improvement, not a rewrite. cc @{mention}",
]

COMMENT_BODIES = [
    "On it — will have something by tomorrow.",
    "This turned out deeper than expected, splitting it.",
    "@{mention} can you take a look at the latest push?",
    "Done pending review.",
    "Moving this out, no capacity this sprint.",
    "Repro'd it, fix is small.",
]


def pick_status(profile: str) -> str:
    r = rng.random()
    if profile == "old":  # finished sprints: mostly done, a little carry-over
        return "done" if r < .85 else ("in_progress" if r < .93 else "todo")
    if profile == "current":
        return "todo" if r < .35 else ("in_progress" if r < .7 else "done")
    return "todo" if r < .85 else "in_progress"  # backlog


def main() -> None:
    db.migrate()
    with db.transaction() as conn:
        existing = {u["username"] for u in users.list_users(conn)}
        for name in USERNAMES:
            if name not in existing:
                users.create(conn, name)
        actors = {u["username"]: User(u["id"], u["username"], bool(u["is_admin"]))
                  for u in users.list_users(conn)}
        team = [actors[n] for n in USERNAMES]

        space_ids = {name: spaces.create(conn, name)["id"] for name in SPACES}

        sprint_ids = {}
        for sp, name, start, end, _archive in SPRINTS:
            sprint_ids[name] = sprints.create(
                conn, space_ids[sp], name, day(start), day(end))["id"]
            # past sprints auto-archive and would reject tasks; lift that
            # while seeding, re-archive at the end
            sprints.update(conn, sprint_ids[name], archived=False)

        proj_by_space: dict[str, list[dict]] = {sp: [] for sp in SPACES}
        finishing = []  # (project, final status, archived) to apply after tasks
        for sp, title, tags, due, final, archived in PROJECTS:
            owner = rng.choice(team)
            p = projects.create(conn, owner, {
                "space_id": space_ids[sp], "title": title, "tags": tags,
                "description": rng.choice(DESCRIPTIONS).format(
                    mention=rng.choice(USERNAMES)),
                "status": "in_progress" if final == "done" else final,
                "owner_id": owner.id,
                "start_date": day(-rng.randrange(10, 60)).isoformat(),
                "due_date": day(due).isoformat() if due is not None else None,
            })
            proj_by_space[sp].append(p)
            if final == "done" or archived:
                finishing.append((p, final, archived))
        done_project_ids = {p["id"] for p, final, _ in finishing if final == "done"}

        titles = {}
        for sp, (verbs, objs) in TITLES.items():
            combos = [f"{v} {o}" for v in verbs for o in objs]
            rng.shuffle(combos)
            titles[sp] = combos

        made: dict[str, list[dict]] = {sp: [] for sp in SPACES}
        for sp, sprint_name, count, profile in BATCHES:
            for _ in range(count):
                project = rng.choice(proj_by_space[sp]) if rng.random() < .85 else None
                # projects flipped to done at the end only hold finished tasks
                status = ("done" if project and project["id"] in done_project_ids
                          else pick_status(profile))
                desc = (rng.choice(DESCRIPTIONS).format(mention=rng.choice(USERNAMES))
                        if rng.random() < .4 else "")
                t = tasks.create(conn, rng.choice(team), {
                    "space_id": space_ids[sp],
                    "title": titles[sp].pop(),
                    "description": desc,
                    "status": status,
                    "priority": rng.choices(["low", "medium", "high", "urgent"],
                                            weights=[2, 5, 3, 1])[0],
                    "assignee_id": rng.choice(team).id if rng.random() < .8 else None,
                    "sprint_id": sprint_ids[sprint_name] if sprint_name else None,
                    "project_id": project["id"] if project else None,
                })
                made[sp].append(t)

        n_comments = 0
        for sp in SPACES:
            for t in rng.sample(made[sp], 5):
                comments.create(conn, rng.choice(team), "task", t["id"],
                                rng.choice(COMMENT_BODIES).format(
                                    mention=rng.choice(USERNAMES)))
                n_comments += 1
            p = rng.choice(proj_by_space[sp])
            comments.create(conn, rng.choice(team), "project", p["id"],
                            "Kickoff notes and open questions below.")
            n_comments += 1

        n_blockers = 0
        for sp in SPACES:
            open_tasks = [t for t in made[sp] if t["status"] != "done"]
            rng.shuffle(open_tasks)
            while len(open_tasks) >= 2 and n_blockers < 6:
                blocked, blocker = open_tasks.pop(), open_tasks.pop()
                tasks.add_blocker(conn, rng.choice(team), blocked["id"], blocker["id"])
                n_blockers += 1

        for _, name, _, _, archive in SPRINTS:
            if archive:
                sprints.update(conn, sprint_ids[name], archived=True)
        for p, final, archived in finishing:
            fields = {"status": final} if final == "done" else {}
            if archived:
                fields["archived"] = True
            projects.update(conn, actors["zk"], p["id"], fields)

        n_tasks = sum(len(v) for v in made.values())
        print(f"seeded {len(SPACES)} spaces, {len(USERNAMES)} users, "
              f"{len(PROJECTS)} projects, {len(SPRINTS)} sprints, "
              f"{n_tasks} tasks, {n_comments} comments, {n_blockers} blockers")


if __name__ == "__main__":
    main()
