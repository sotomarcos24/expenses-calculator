"""Password hashing (Argon2), access-token (JWT, HS256) helpers and the ``CurrentUser``
dependency that authenticates a request from the ``access_token`` cookie.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, status

from app.config import get_settings
from app.db import DbSession
from app.models import User

JWT_ALGORITHM = "HS256"
# Tolerance for small clock skew when decoding (PyJWT applies it to both ``iat`` and ``exp``).
JWT_LEEWAY = timedelta(seconds=5)
ACCESS_TOKEN_COOKIE = "access_token"
COOKIE_PATH = "/api"

_password_hasher = PasswordHasher()


def normalize_email(email: str) -> str:
    """Strip surrounding whitespace and lowercase the email."""
    return email.strip().lower()


def hash_password(password: str) -> str:
    """Return an Argon2 hash (``$argon2id$...``) of ``password`` with a random salt."""
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Return whether ``password`` matches ``password_hash``.

    Never raises: a mismatch or a malformed/invalid hash returns ``False``.
    """
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: int) -> str:
    """Return a JWT for ``user_id`` signed with HS256, valid for ``access_token_days`` days."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=settings.access_token_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user id carried by ``token``, or ``None`` if the token is invalid.

    A token is valid only if it is signed with HS256 using ``jwt_secret``, is not expired,
    and has a ``sub`` claim that is an integer string. Any other token (other algorithm,
    ``alg: none``, bad signature, expired, missing/non-integer ``sub``, not a JWT) yields
    ``None``; this function never raises.

    Decoding uses a ``JWT_LEEWAY`` (5 s) tolerance for clock skew, so a freshly issued token
    whose ``iat`` is slightly in the future is accepted; the same tolerance applies to ``exp``.
    """
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
            leeway=JWT_LEEWAY,
        )
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not (sub.isascii() and sub.isdigit()):
        return None
    return int(sub)


def get_current_user(
    db: DbSession,
    access_token: Annotated[str | None, Cookie(alias=ACCESS_TOKEN_COOKIE)] = None,
) -> User:
    """Return the user authenticated by the ``access_token`` cookie, or raise 401.

    A missing cookie, an invalid/expired/forged token, or a token whose user no longer
    exists all give ``401 {"detail": "Not authenticated"}``.
    """
    user_id = decode_access_token(access_token) if access_token else None
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
