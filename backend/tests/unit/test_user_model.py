import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password


def test_user_is_persisted_with_timestamps(db_session: Session) -> None:
    user = User(email="a@b.com", password_hash=hash_password("secret-password"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.id is not None
    assert user.created_at is not None
    assert user.updated_at is not None


def test_duplicate_email_raises_integrity_error(db_session: Session) -> None:
    db_session.add(User(email="dup@example.com", password_hash=hash_password("one")))
    db_session.commit()

    db_session.add(User(email="dup@example.com", password_hash=hash_password("two")))
    with pytest.raises(IntegrityError):
        db_session.commit()
