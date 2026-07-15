"""App factory: API routers, MCP mount, SPA static serving."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

from . import db, mcp_server
from .errors import CortexError
from .routers import (auth as auth_router, comments as comments_router,
                      images as images_router,
                      notifications as notifications_router,
                      projects as projects_router, search as search_router,
                      spaces as spaces_router, sprints as sprints_router,
                      statuses as statuses_router,
                      tasks as tasks_router, users as users_router)


def create_app() -> FastAPI:
    mcp = mcp_server.build_mcp()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.migrate()
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title="cortex", lifespan=lifespan)

    @app.exception_handler(CortexError)
    async def cortex_error_handler(request, exc: CortexError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.message})

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    for module in (auth_router, users_router, spaces_router, sprints_router,
                   statuses_router, tasks_router, projects_router, comments_router,
                   notifications_router, search_router, images_router):
        app.include_router(module.router)

    app.mount("/mcp", mcp_server.mcp_asgi_app(mcp))

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        # SPA fallback: any non-API path serves index.html so deep links work
        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith(("api/", "mcp")) or path == "api":
                return JSONResponse(status_code=404, content={"detail": "not found"})
            return FileResponse(FRONTEND_DIST / "index.html")

    # bare /mcp doesn't match the mount and would 307 to /mcp/, which MCP
    # clients don't follow — rewrite before routing instead
    class McpPathRewrite:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope["type"] == "http" and scope["path"] == "/mcp":
                scope["path"] = "/mcp/"
            await self.app(scope, receive, send)

    app.add_middleware(McpPathRewrite)
    app.add_middleware(db.DbPerRequest)

    return app


app = create_app()
