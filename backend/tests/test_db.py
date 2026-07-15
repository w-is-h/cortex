"""DbPerRequest: REST writes are durable before the response starts."""

import anyio

from cortex import db


def run_middleware(endpoint_status: int, on_response_start):
    """Run DbPerRequest around a minimal endpoint that inserts a row."""

    async def endpoint(scope, receive, send):
        scope["state"]["db"].execute(
            "INSERT INTO spaces (name, created_at) VALUES ('probe', '2026-01-01')")
        await send({"type": "http.response.start", "status": endpoint_status, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    async def send(message):
        if message["type"] == "http.response.start":
            on_response_start()

    scope = {"type": "http", "path": "/api/probe", "headers": []}
    anyio.run(db.DbPerRequest(endpoint), scope, None, send)


def probe_count() -> int:
    """How many probe rows a fresh connection sees."""
    conn = db.connect()
    try:
        return conn.execute("SELECT COUNT(*) FROM spaces WHERE name = 'probe'").fetchone()[0]
    finally:
        conn.close()


def test_write_committed_before_response_start(app):
    seen = {}
    run_middleware(200, lambda: seen.update(visible=probe_count()))
    assert seen["visible"] == 1


def test_error_response_rolls_back(app):
    run_middleware(409, lambda: None)
    assert probe_count() == 0
