"""Status vocabulary: fixed in code, not user-editable.

Cortex ships one opinionated workflow. If yours differs, edit these lists —
API validation, the UI and the MCP docs all derive from them. When removing
a key, add a migration that reassigns existing rows.
"""

from typing import Literal, get_args

Status = Literal["todo", "in_progress", "done"]
ProjectStatus = Literal["scoping", "poc", "development", "live"]

TASK_STATUSES = [
    {"key": "todo", "label": "To do", "color": "#8b949e", "is_done": False},
    {"key": "in_progress", "label": "In progress", "color": "#58a6ff", "is_done": False},
    {"key": "done", "label": "Done", "color": "#3fb950", "is_done": True},
]

PROJECT_STATUSES = [
    {"key": "scoping", "label": "Scoping", "color": "#a371f7", "is_done": False},
    {"key": "poc", "label": "PoC", "color": "#e3b341", "is_done": False},
    {"key": "development", "label": "Development", "color": "#58a6ff", "is_done": False},
    {"key": "live", "label": "Live", "color": "#3fb950", "is_done": True},
]

DONE_TASK_KEYS = tuple(s["key"] for s in TASK_STATUSES if s["is_done"])

assert set(get_args(Status)) == {s["key"] for s in TASK_STATUSES}
assert set(get_args(ProjectStatus)) == {s["key"] for s in PROJECT_STATUSES}
