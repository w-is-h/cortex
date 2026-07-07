"""Ordered SQL migration scripts, applied by PRAGMA user_version."""

SCHEMA = """
CREATE TABLE spaces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);

CREATE TABLE sprints (
    id INTEGER PRIMARY KEY,
    space_id INTEGER NOT NULL REFERENCES spaces(id),
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    space_id INTEGER NOT NULL REFERENCES spaces(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    start_date TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    space_id INTEGER NOT NULL REFERENCES spaces(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assignee_id INTEGER REFERENCES users(id),
    sprint_id INTEGER REFERENCES sprints(id),
    project_id INTEGER REFERENCES projects(id),
    sort_order REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE task_blocks (
    blocker_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE comments (
    id INTEGER PRIMARY KEY,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('task', 'project')),
    parent_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE reactions (
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    emoji TEXT NOT NULL,
    PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE images (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL
        CHECK (type IN ('assigned', 'status_changed', 'commented', 'mentioned')),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    task_id INTEGER REFERENCES tasks(id),
    project_id INTEGER REFERENCES projects(id),
    comment_id INTEGER REFERENCES comments(id),
    created_at TEXT NOT NULL,
    read_at TEXT
);

CREATE TABLE activity (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_space_sprint ON tasks(space_id, sprint_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_comments_parent ON comments(parent_type, parent_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_activity_task ON activity(task_id);

CREATE VIRTUAL TABLE tasks_fts USING fts5(
    title, description, content='tasks', content_rowid='id'
);
CREATE TRIGGER tasks_fts_ai AFTER INSERT ON tasks BEGIN
    INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER tasks_fts_ad AFTER DELETE ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER tasks_fts_au AFTER UPDATE OF title, description ON tasks BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.id, old.title, old.description);
    INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE projects_fts USING fts5(
    title, description, content='projects', content_rowid='id'
);
CREATE TRIGGER projects_fts_ai AFTER INSERT ON projects BEGIN
    INSERT INTO projects_fts(rowid, title, description)
    VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER projects_fts_ad AFTER DELETE ON projects BEGIN
    INSERT INTO projects_fts(projects_fts, rowid, title, description)
    VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER projects_fts_au AFTER UPDATE OF title, description ON projects BEGIN
    INSERT INTO projects_fts(projects_fts, rowid, title, description)
    VALUES ('delete', old.id, old.title, old.description);
    INSERT INTO projects_fts(rowid, title, description)
    VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE comments_fts USING fts5(
    body, content='comments', content_rowid='id'
);
CREATE TRIGGER comments_fts_ai AFTER INSERT ON comments BEGIN
    INSERT INTO comments_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER comments_fts_ad AFTER DELETE ON comments BEGIN
    INSERT INTO comments_fts(comments_fts, rowid, body)
    VALUES ('delete', old.id, old.body);
END;
CREATE TRIGGER comments_fts_au AFTER UPDATE OF body ON comments BEGIN
    INSERT INTO comments_fts(comments_fts, rowid, body)
    VALUES ('delete', old.id, old.body);
    INSERT INTO comments_fts(rowid, body) VALUES (new.id, new.body);
END;

INSERT INTO users (username, is_admin, created_at) VALUES ('admin', 1, datetime('now'));
INSERT INTO spaces (name, created_at) VALUES ('General', datetime('now'));
"""

MIGRATIONS: list[str] = [
    SCHEMA,
    # v2: projects gain an optional owner (assigned user)
    "ALTER TABLE projects ADD COLUMN owner_id INTEGER REFERENCES users(id);",
    # v3: sprints can be manually archived/unarchived; NULL = auto (past due + 7 days)
    "ALTER TABLE sprints ADD COLUMN archived_override INTEGER;",
    # v4: per-space customizable task & project statuses
    """
    CREATE TABLE statuses (
        id         INTEGER PRIMARY KEY,
        space_id   INTEGER NOT NULL REFERENCES spaces(id),
        kind       TEXT NOT NULL,                 -- 'task' | 'project'
        key        TEXT NOT NULL,
        label      TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#8b949e',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_done    INTEGER NOT NULL DEFAULT 0,
        UNIQUE(space_id, kind, key)
    );
    ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'scoping';

    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'task', 'todo', 'To do', '#8b949e', 0, 0 FROM spaces;
    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'task', 'in_progress', 'In progress', '#58a6ff', 1, 0 FROM spaces;
    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'task', 'done', 'Done', '#3fb950', 2, 1 FROM spaces;

    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'project', 'scoping', 'Scoping', '#a371f7', 0, 0 FROM spaces;
    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'project', 'poc', 'PoC', '#e3b341', 1, 0 FROM spaces;
    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'project', 'development', 'Development', '#58a6ff', 2, 0 FROM spaces;
    INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done)
        SELECT id, 'project', 'live', 'Live', '#3fb950', 3, 1 FROM spaces;
    """,
    # v5: per-space default sprint length (days), used to prefill the new-sprint form
    "ALTER TABLE spaces ADD COLUMN default_sprint_days INTEGER NOT NULL DEFAULT 14;",
    # v6: shareable external task ref (cx-XXXXXXXXX) for use in GitHub, chat, etc.
    """
    ALTER TABLE tasks ADD COLUMN ref TEXT;
    UPDATE tasks SET ref = 'cx-' || (abs(random()) % 900000000 + 100000000) WHERE ref IS NULL;
    CREATE UNIQUE INDEX idx_tasks_ref ON tasks(ref);
    """,
    # v7: drop the hardcoded status CHECK on tasks — statuses are now per-space & custom.
    # SQLite can't ALTER a CHECK away, so rebuild the table (FK off during the swap).
    """
    PRAGMA foreign_keys=OFF;
    CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'medium'
            CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_id INTEGER REFERENCES users(id),
        sprint_id INTEGER REFERENCES sprints(id),
        project_id INTEGER REFERENCES projects(id),
        sort_order REAL NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ref TEXT
    );
    INSERT INTO tasks_new (id, space_id, title, description, status, priority, assignee_id,
        sprint_id, project_id, sort_order, created_by, created_at, updated_at, ref)
      SELECT id, space_id, title, description, status, priority, assignee_id,
        sprint_id, project_id, sort_order, created_by, created_at, updated_at, ref FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_new RENAME TO tasks;
    CREATE INDEX idx_tasks_space_sprint ON tasks(space_id, sprint_id);
    CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX idx_tasks_project ON tasks(project_id);
    CREATE UNIQUE INDEX idx_tasks_ref ON tasks(ref);
    CREATE TRIGGER tasks_fts_ai AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END;
    CREATE TRIGGER tasks_fts_ad AFTER DELETE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
    END;
    CREATE TRIGGER tasks_fts_au AFTER UPDATE OF title, description ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
        INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END;
    PRAGMA foreign_keys=ON;
    """,
    # v8: statuses move from the DB into code (cortex/statuses.py). Remap any custom
    # keys onto the fixed set (done-flagged → done/live, the rest → a mid-flow status),
    # then drop the table. notifications is also rebuilt with ON DELETE CASCADE so
    # deleting a task/project/comment cleans up its notifications via the FKs.
    """
    UPDATE tasks SET status = CASE
        WHEN status IN ('todo', 'in_progress', 'done') THEN status
        WHEN EXISTS(SELECT 1 FROM statuses st WHERE st.space_id = tasks.space_id
                    AND st.kind = 'task' AND st.key = tasks.status AND st.is_done = 1)
            THEN 'done'
        ELSE 'in_progress' END;
    UPDATE projects SET status = CASE
        WHEN status IN ('scoping', 'poc', 'development', 'live') THEN status
        WHEN EXISTS(SELECT 1 FROM statuses st WHERE st.space_id = projects.space_id
                    AND st.kind = 'project' AND st.key = projects.status AND st.is_done = 1)
            THEN 'live'
        ELSE 'development' END;
    DROP TABLE statuses;

    PRAGMA foreign_keys=OFF;
    CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL
            CHECK (type IN ('assigned', 'status_changed', 'commented', 'mentioned')),
        actor_id INTEGER NOT NULL REFERENCES users(id),
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        read_at TEXT
    );
    INSERT INTO notifications_new SELECT * FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_new RENAME TO notifications;
    CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
    PRAGMA foreign_keys=ON;
    """,
]
