import re
import sqlite3

TOKEN_RE = re.compile(r"\w+", re.UNICODE)
SNIPPET = "snippet({fts}, -1, '<mark>', '</mark>', '…', 12)"


def _fts_query(q: str) -> str:
    """Turn raw user input into a safe FTS5 prefix query: '"fix"* "log"*'."""
    tokens = TOKEN_RE.findall(q)
    return " ".join(f'"{t}"*' for t in tokens)


def search(db: sqlite3.Connection, q: str, space_id: int | None = None,
           limit: int = 15, kinds: list[str] | None = None,
           status: str | None = None, has_images: bool = False) -> dict:
    """Full-text search across tasks/projects/comments, with optional filters.
    kinds limits which of task|project|comment to return; status filters task hits;
    has_images keeps only items whose markdown contains an image (![...])."""
    match = _fts_query(q)
    want = set(kinds) if kinds else {"task", "project", "comment"}
    out: dict = {"tasks": [], "projects": [], "comments": []}
    if not match:
        return out

    if "task" in want:
        clauses, params = ["tasks_fts MATCH ?"], [match]
        if space_id is not None:
            clauses.append("t.space_id = ?"); params.append(space_id)
        if status:
            clauses.append("t.status = ?"); params.append(status)
        if has_images:
            clauses.append("t.description LIKE '%![%'")
        params.append(limit)
        out["tasks"] = [dict(r) for r in db.execute(
            f"""SELECT t.id, t.ref, t.title, t.status, t.priority, t.sprint_id, t.space_id,
                       {SNIPPET.format(fts='tasks_fts')} AS snippet
                FROM tasks_fts JOIN tasks t ON t.id = tasks_fts.rowid
                WHERE {' AND '.join(clauses)} ORDER BY rank LIMIT ?""", params)]

    if "project" in want:
        clauses, params = ["projects_fts MATCH ?"], [match]
        if space_id is not None:
            clauses.append("p.space_id = ?"); params.append(space_id)
        if has_images:
            clauses.append("p.description LIKE '%![%'")
        params.append(limit)
        out["projects"] = [dict(r) for r in db.execute(
            f"""SELECT p.id, p.title, p.due_date, p.space_id,
                       {SNIPPET.format(fts='projects_fts')} AS snippet
                FROM projects_fts JOIN projects p ON p.id = projects_fts.rowid
                WHERE {' AND '.join(clauses)} ORDER BY rank LIMIT ?""", params)]

    if "comment" in want:
        clauses = ["comments_fts MATCH ?"]
        params = [match]
        if space_id is not None:
            clauses.append("COALESCE(t.space_id, p.space_id) = ?"); params.append(space_id)
        if has_images:
            clauses.append("c.body LIKE '%![%'")
        params.append(limit)
        out["comments"] = [dict(r) for r in db.execute(
            f"""SELECT c.id, c.parent_type, c.parent_id, u.username AS author_username,
                       COALESCE(t.title, p.title) AS parent_title,
                       COALESCE(t.space_id, p.space_id) AS space_id,
                       {SNIPPET.format(fts='comments_fts')} AS snippet
                FROM comments_fts
                JOIN comments c ON c.id = comments_fts.rowid
                JOIN users u ON u.id = c.author_id
                LEFT JOIN tasks t ON c.parent_type = 'task' AND t.id = c.parent_id
                LEFT JOIN projects p ON c.parent_type = 'project' AND p.id = c.parent_id
                WHERE {' AND '.join(clauses)} ORDER BY rank LIMIT ?""", params)]

    return out
