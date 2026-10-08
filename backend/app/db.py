from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def make_engine(url: str, **engine_options: Any) -> Engine:
    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args, **engine_options)
    if url.startswith("sqlite"):
        # SQLite ignores foreign keys (and ON DELETE CASCADE) unless enabled per connection.
        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_conn: Any, _record: Any) -> None:
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]
