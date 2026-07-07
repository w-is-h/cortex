# cortex — the maintainer's manual, for agents

Humans read README.md. This file is for the AI agents that extend, fix, and
operate cortex — in this repo, you are the extension mechanism.

## The contract

Cortex is one small core done extremely well, extended not by feature PRs but
by each user's agent editing their own copy. Five rules keep that working:

1. **Minimal dependencies.** A dependency earns its place with accumulated
   edge cases (an editor, a drag-and-drop engine), not typing time saved. If
   you use one function from a library, write the function. Current counts:
   backend 5, frontend 17 runtime — justify any increase.
2. **The schema is the contract.** Personal forks survive core updates iff the
   data model stays stable. Schema changes are appended to `MIGRATIONS` in
   `backend/cortex/migrations.py` (ordered by `PRAGMA user_version`); applied
   entries are frozen history — never edit them. SQLite can't drop constraints
   or NOT NULL: rebuild the table (pattern in v7/v9, FTS triggers included).
3. **One way of doing things.** Routers are thin HTTP shims; all logic lives in
   `services/`, shared by REST and MCP. `db.transaction()` is the only
   connection pattern. FK cascades clean up children; polymorphic `comments`
   is the sole manual delete.
4. **Tests are the API.** `uv run pytest` (~1s) is what tells you the core
   survived your change. Every invariant gets a test; behavior through the
   real API on a real SQLite, no mocks.
5. **No feature checklists.** No config knobs, per-space toggles, or admin CRUD
   for anything a code edit covers. Statuses are the worked example below —
   they used to be a DB table with CRUD; now they're a list in a file.

## Map

    backend/cortex/
      main.py         app factory: routers + MCP mount + SPA static serving
      db.py           connect() / transaction() / get_db() / migrate()
      migrations.py   ordered SQL scripts, PRAGMA user_version
      statuses.py     status vocabularies — code, not DB (see below)
      models.py       pydantic request/response schemas (edge validation)
      auth.py         sessions + ck_* API keys (user_from_api_key, shared with MCP)
      errors.py       CortexError → HTTP status mapping
      services/       all domain logic
      routers/        thin REST shims over services
      mcp_server.py   20 MCP tools over the same services (/mcp, Bearer ck_*)
    backend/tests/    32 tests; conftest boots the real app on a tmp SQLite
    frontend/src/     Vite + React SPA (react-query, hello-pangea/dnd, tailwind)

## Domain invariants (enforced in services/, covered by tests)

- **Statuses**: fixed per-kind vocabularies in `statuses.py`; the task and
  project lists are separate so they evolve independently. Values validate via
  the `Status` / `ProjectStatus` Literals at both REST and MCP edges.
- **Projects**: `tags` are the customization axis — freeform, normalized
  (`norm_tags`: lowercase, no `#`, hyphens), no registry. `due_date` is
  nullable: deliverables have one, ongoing/stream projects don't. Done or
  archived projects reject new/moved-in tasks (409).
- **Sprints**: `is_current` and `archived` are derived (end + 7 days), with
  `archived_override` winning; archived sprints reject moves in.
- **Blockers**: same space, no cycles, no self-block. A task is `blocked`
  while any blocker is not done.
- **Notifications**: never to yourself; mention notifications dedup against
  the previous text; FK cascades clean them up.
- **Task refs**: `cx-XXXXXXXXX`, unique, non-sequential — the id used in
  GitHub issues and chat; `get_task` accepts it.

## Worked example: "add a review column to tasks"

1. `backend/cortex/statuses.py`: add `{"key": "review", "label": "Review",
   "color": "#e3b341", "is_done": False}` to `TASK_STATUSES`, and `"review"`
   to the `Status` Literal. (Project statuses are a separate list — don't
   touch it.)
2. Migration: none needed — a new key breaks no existing rows. *Removing* a
   key is what needs one (reassign rows first; see v8).
3. Done. Board columns, list grouping, validation, and the MCP docs all
   derive from the list. Run `uv run pytest`.

## Verify

- `uv run pytest` — 32 tests, ~1 second. This is the gate.
- Live: `./start.sh`, then `scripts/smoke.sh` and `uv run scripts/mcp_check.py`.
  Both write to the live DB — clean up what they create.
- Frontend: `cd frontend && npm run build` must be clean.

## Operating a running cortex (MCP)

Mint a `ck_*` key in Admin, connect to `/mcp` (streamable HTTP, same key as
REST). Start every session with `get_workspace` — it returns who you are, the
spaces, users, status vocabularies, and the project tags in use. 20 tools;
`update_task`/`update_project` take `clear=[...]` to empty nullable fields;
`list_notifications` marks what it returns as read.
