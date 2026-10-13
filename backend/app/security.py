"""Password hashing (Argon2) and access-token (JWT, HS256) helpers.

Pure functions: no FastAPI request handling here.
"""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings

JWT_ALGORITHM = "HS256"

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
    """
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not (sub.isascii() and sub.isdigit()):
        return None
    return int(sub)
