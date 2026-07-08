"""Status vocabulary: fixed in code, not user-editable.

Tasks and projects share the same lifecycle idea — not started, moving,
finished — but each kind has its own list so they can evolve independently:
adding a "review" column to tasks must not leak into projects. This is the
expected customization point; edit a list (and its Literal) and API
validation, the UI and the MCP docs all follow. When removing a key, add a
migration that reassigns existing rows. Domain vocabulary (phases, "live",
clients, ...) belongs in project tags, not here.
"""

from typing import Literal, get_args

Status = Literal["todo", "in_progress", "done"]
ProjectStatus = Literal["todo", "in_progress", "done"]

TASK_STATUSES = [
    {"key": "todo", "label": "To do", "color": "#8b949e", "is_done": False},
    {"key": "in_progress", "label": "In progress", "color": "#58a6ff", "is_done": False},
    {"key": "done", "label": "Done", "color": "#db6d28", "is_done": True},
]

PROJECT_STATUSES = [
    {"key": "todo", "label": "To do", "color": "#8b949e", "is_done": False},
    {"key": "in_progress", "label": "In progress", "color": "#58a6ff", "is_done": False},
    {"key": "done", "label": "Done", "color": "#db6d28", "is_done": True},
]

TASK_DONE_KEYS = tuple(s["key"] for s in TASK_STATUSES if s["is_done"])
PROJECT_DONE_KEYS = tuple(s["key"] for s in PROJECT_STATUSES if s["is_done"])

assert set(get_args(Status)) == {s["key"] for s in TASK_STATUSES}
assert set(get_args(ProjectStatus)) == {s["key"] for s in PROJECT_STATUSES}
