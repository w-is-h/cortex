# cortex

A fast, quiet sprint & task manager for small teams — and it's AI-first: agents
plug in over a first-class REST API and MCP server and work the board like a
teammate, while humans get a clean SPA.

## Philosophy

Cortex is deliberately small: one opinionated core, done well — not a feature
checklist. The bet is that you have an AI agent (cortex ships an MCP server;
that's the point), so a missing feature is a five-minute conversation with your
agent, producing code custom-built for you — not a toggle buried in a settings
maze built for everyone.

**Want a feature? Don't open a PR — ask your agent**, and point it at
[AGENTS.md](AGENTS.md): the maintainer's manual with the rules, invariants, and
worked examples it needs to extend cortex safely. Your copy becomes yours; the
core stays lean. Upstream takes bug fixes, performance, and schema/migration
work — polish to the core, not new surface.

## What you get

- **Spaces** → sprints, backlog, projects, tasks — each space is its own world.
- **Board** with drag-and-drop kanban, a grouped list view, multi-select, and
  shift-click range select.
- **One opinionated lifecycle**: todo / in progress / done — for tasks and projects
  alike. Statuses live in code (`backend/cortex/statuses.py`) — if yours differ, edit
  the list and the board, API validation and MCP docs all follow. Domain vocabulary
  (phases, clients, "live") goes in project **tags** instead.
- **Sprints** you can create, edit, and archive (auto-archives a week after it ends).
- **Tasks**: markdown descriptions — rendered by default, click to edit, done
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
attributed to it. The MCP surface is deliberately small — 20 tools covering the verbs
an agent actually performs: tasks (create/update/move/delete, blockers), sprints,
projects, comments, full-text `search`, notifications, and one `get_workspace` call
that returns who you are plus every id and status key the other tools expect.
