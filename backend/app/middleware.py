"""App-wide middleware."""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _is_json_media_type(content_type: str | None) -> bool:
    if content_type is None:
        return False
    media_type = content_type.split(";", 1)[0].strip().lower()
    return media_type == "application/json"


class RequireJsonContentTypeMiddleware:
    """Reject mutating ``/api`` requests whose media type is not ``application/json`` (415).

    CSRF defence (tech-spec §5): together with ``SameSite=Lax`` it stops cross-site HTML
    forms, which cannot send ``application/json``. Applies to body-less requests too and
    runs before routing, so every router is covered without extra code.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in MUTATING_METHODS:
            path: str = scope["path"]
            if path == "/api" or path.startswith("/api/"):
                content_type = None
                for name, value in scope["headers"]:
                    if name == b"content-type":
                        content_type = value.decode("latin-1")
                        break
                if not _is_json_media_type(content_type):
                    response = JSONResponse(
                        {"detail": "Content-Type must be application/json"}, status_code=415
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)
