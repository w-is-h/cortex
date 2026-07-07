"""Status vocabulary: fixed in code, not user-editable.

One lifecycle for tasks and projects alike: not started, moving, finished.
Domain vocabulary (phases, "live", clients, ...) belongs in project tags,
not here. If your workflow truly differs, edit this list — API validation,
the UI and the MCP docs all derive from it. When removing a key, add a
migration that reassigns existing rows.
"""

from typing import Literal, get_args

Status = Literal["todo", "in_progress", "done"]

STATUSES = [
    {"key": "todo", "label": "To do", "color": "#8b949e", "is_done": False},
    {"key": "in_progress", "label": "In progress", "color": "#58a6ff", "is_done": False},
    {"key": "done", "label": "Done", "color": "#3fb950", "is_done": True},
]

DONE_KEYS = tuple(s["key"] for s in STATUSES if s["is_done"])

assert set(get_args(Status)) == {s["key"] for s in STATUSES}
