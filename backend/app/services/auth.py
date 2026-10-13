"""Account registration and credential checks."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password, normalize_email, verify_password

# Verified against when the email is unknown, so login takes about the same time either way.
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-only")


class EmailAlreadyRegisteredError(Exception):
    """Raised when registering an email that already has an account."""


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def register_user(db: Session, email: str, password: str) -> User:
    """Create a user with a normalised email and an Argon2 password hash.

    Raises ``EmailAlreadyRegisteredError`` if the email is taken, either on the pre-check
    or when the unique constraint fires on insert (concurrent registration).
    """
    email = normalize_email(email)
    if get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegisteredError
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EmailAlreadyRegisteredError from exc
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Return the user if ``email`` and ``password`` match an account, else ``None``."""
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
