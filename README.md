# cortex

A sprint and task manager for small teams, built AI-first: agents connect over
a REST API and an MCP server and work the board like a teammate; humans use a
clean SPA.

## Scope

The core is small and opinionated, and extending it is an agent's job. If you
need a feature, ask your agent and point it at [AGENTS.md](AGENTS.md) — the
maintainer's manual with the rules, invariants, and worked examples needed to
extend cortex safely.

## What you get

- **Spaces** → sprints, backlog, projects, tasks — each space is fully separate.
- **Board** with drag-and-drop kanban, a grouped list view, multi-select, and
  shift-click range select.
- **One lifecycle**: todo / in progress / done — for tasks and projects alike.
  Statuses live in code (`backend/cortex/statuses.py`) — if yours differ, edit
  the list and the board, API validation and MCP docs all follow. Domain
  vocabulary (phases, clients, "live") goes in project **tags**.
- **Sprints** you can create, edit, and archive (auto-archives a week after it ends).
- **Tasks**: markdown descriptions — rendered by default, click to edit
  (paste images, `@mentions`, clickable checkboxes) — priorities, assignees,
  blockers, comments with reactions, and a per-task activity trail. Each task
  gets a shareable id like `cx-123456789`.
- **Projects** with an owner, freeform tags, and a drag-to-resize timeline
  (weeks / months). Deliverables get a due date; ongoing/stream projects just don't.
- **Light & dark** themes and ⌘K search with filters (type, status, has-images).

## Run

```sh
./start.sh              # builds the SPA if needed, serves everything on :8000
```

Open http://localhost:8000 and log in as `admin` (username-only). Add users in Admin.
Data lives in `data/` — back it up by copying the folder.

Develop with live reload:

```sh
uv run uvicorn cortex.main:app --reload     # api on :8000
cd frontend && npm run dev                  # vite on :5173 (proxies /api)
```

Seed sample data (a Demo space with a sprint, project, tasks, comments):

```sh
uv run python scripts/seed.py
```

## Agents

Mint an API key in Admin, then connect over **REST** (`Authorization: Bearer ck_…`,
OpenAPI at `/docs`) or **MCP** (streamable HTTP at `/mcp`, same key):

```sh
claude mcp add --transport http cortex http://localhost:8000/mcp \
  --header "Authorization: Bearer ck_…"
```

A key acts as its owner, so give an agent its own user if you want its actions
attributed to it. The MCP surface is 20 tools covering the verbs an agent
performs: tasks (create/update/move/delete, blockers), sprints, projects,
comments, full-text `search`, notifications, and one `get_workspace` call that
returns who you are plus every id and status key the other tools expect.

## Contributing

Upstream stays minimal. PRs are welcome when they improve the core for
everyone: bug fixes, performance, design, schema/migration work, or a small
feature that is useful in any deployment.

A feature specific to your team belongs in your fork: have your agent build it
there ([AGENTS.md](AGENTS.md) is the manual), and merge from main to keep
receiving core updates. If your fork diverges too far to merge cheaply, keep
building your own thing and stop tracking upstream.
