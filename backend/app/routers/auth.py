from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.config import Settings, get_settings
from app.db import DbSession
from app.models import User
from app.ratelimit import rate_limit
from app.schemas.auth import LoginRequest, RegisterRequest, UserRead
from app.security import (
    ACCESS_TOKEN_COOKIE,
    COOKIE_PATH,
    CurrentUser,
    create_access_token,
)
from app.services.auth import EmailAlreadyRegisteredError, authenticate_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


def _set_auth_cookie(response: Response, user: User, settings: Settings) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=create_access_token(user.id),
        max_age=settings.access_token_days * 86400,
        path=COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


TOO_MANY: dict[int | str, dict[str, Any]] = {
    429: {"description": "Too many attempts; see the Retry-After header"}
}


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register"))],
    responses=TOO_MANY,
)
def register(
    body: RegisterRequest, db: DbSession, response: Response, settings: SettingsDep
) -> UserRead:
    try:
        user = register_user(db, body.email, body.password)
    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from None
    _set_auth_cookie(response, user, settings)
    return UserRead.model_validate(user)


@router.post("/login", dependencies=[Depends(rate_limit("login"))], responses=TOO_MANY)
def login(body: LoginRequest, db: DbSession, response: Response, settings: SettingsDep) -> UserRead:
    user = authenticate_user(db, body.email, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    _set_auth_cookie(response, user, settings)
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: SettingsDep) -> None:
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        path=COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.get("/me")
def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
