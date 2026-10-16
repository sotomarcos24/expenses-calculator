"""Serve the built single-page frontend from the API (production, single service)."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.responses import Response

ASSET_CACHE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"


def mount_frontend(app: FastAPI, dist_dir: Path) -> None:
    """Serve `dist_dir` at `/` with an `index.html` fallback; no-op if it does not exist.

    Relative paths resolve against the backend directory. `/api/*` is never served from here:
    unknown API paths keep returning the JSON 404.
    """
    if not dist_dir.is_absolute():
        dist_dir = Path(__file__).resolve().parent.parent / dist_dir
    root = dist_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        return

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str) -> Response:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            cache = ASSET_CACHE if path.startswith("assets/") else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})
