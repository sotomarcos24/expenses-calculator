"""In-memory sliding-window rate limiter (per process; resets on restart)."""

import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.config import Settings, get_settings

# TEMPORARY (#59): "uvicorn.error" is configured by uvicorn at INFO, plain app loggers are not.
_debug_log = logging.getLogger("uvicorn.error")

TOO_MANY_ATTEMPTS = "Too many attempts. Try again later."


class RateLimiter:
    """Counts attempts per `(scope, key)` inside a sliding window.

    Entries whose attempts have all expired are purged at most once per window, so memory
    stays bounded by the keys active in the last two windows.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._attempts: dict[tuple[str, str], deque[float]] = {}
        self._last_purge = clock()

    def __len__(self) -> int:
        return len(self._attempts)

    def hit(self, scope: str, key: str, limit: int, window: float) -> int | None:
        """Register an attempt. Return `None` if allowed, else the seconds (>= 1) to wait.

        A `limit` of 0 (or less) disables the limit. Rejected attempts are not recorded,
        so waiting the returned time always allows a new attempt.
        """
        if limit <= 0:
            return None
        with self._lock:
            now = self._clock()
            self._purge(now, window)
            attempts = self._attempts.setdefault((scope, key), deque())
            while attempts and attempts[0] <= now - window:
                attempts.popleft()
            if len(attempts) >= limit:
                return max(1, math.ceil(attempts[0] + window - now))
            attempts.append(now)
            return None

    def _purge(self, now: float, window: float) -> None:
        if now - self._last_purge < window:
            return
        self._last_purge = now
        expired = [k for k, v in self._attempts.items() if not v or v[-1] <= now - window]
        for k in expired:
            del self._attempts[k]


def client_ip(request: Request, trusted_proxy_count: int) -> str:
    """The client IP: the socket peer, or the Nth entry from the right of X-Forwarded-For."""
    peer = request.client.host if request.client else "unknown"
    if trusted_proxy_count <= 0:
        return peer
    header = request.headers.get("x-forwarded-for")
    if header is None:
        return peer
    entries = [e.strip() for e in header.split(",") if e.strip()]
    if len(entries) < trusted_proxy_count:
        return peer
    return entries[-trusted_proxy_count]


def rate_limit(scope: str) -> Callable[..., None]:
    """Build a dependency that limits `scope` per client IP (limits come from `Settings`)."""

    def dependency(request: Request, settings: Annotated[Settings, Depends(get_settings)]) -> None:
        limit = {
            "login": settings.rate_limit_login_attempts,
            "register": settings.rate_limit_register_attempts,
        }[scope]
        limiter: RateLimiter = request.app.state.rate_limiter
        chosen_ip = client_ip(request, settings.trusted_proxy_count)
        # TEMPORARY (#59): remove in phase 2. IPs only, never emails/passwords/tokens.
        _debug_log.info(
            "TEMP #59 rate_limit scope=%s xff=%r peer=%s trusted_proxy_count=%d chosen_ip=%s",
            scope,
            request.headers.get("x-forwarded-for"),
            request.client.host if request.client else None,
            settings.trusted_proxy_count,
            chosen_ip,
        )
        retry_after = limiter.hit(
            scope,
            chosen_ip,
            limit,
            settings.rate_limit_window_seconds,
        )
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=TOO_MANY_ATTEMPTS,
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
