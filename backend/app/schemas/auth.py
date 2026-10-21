from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# EmailStr strips whitespace but only lowercases the domain: callers still apply
# `app.security.normalize_email` before storing or looking up an email.
Email = Annotated[EmailStr, Field(max_length=255)]


class RegisterRequest(BaseModel):
    email: Email
    # Counted in characters and not trimmed. The upper bound protects the Argon2 hasher.
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginRequest(BaseModel):
    email: Email
    # Only bounded, so the login endpoint does not reveal the password policy.
    password: Annotated[str, Field(min_length=1, max_length=128)]


class DeleteAccountRequest(BaseModel):
    # Same bounds as the login password: the policy is not revealed, Argon2 is protected.
    password: Annotated[str, Field(min_length=1, max_length=128)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime
