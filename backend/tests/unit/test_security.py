import base64
import json
import warnings
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from jwt.warnings import InsecureKeyLengthWarning

from app.config import get_settings
from app.security import (
    JWT_LEEWAY,
    create_access_token,
    decode_access_token,
    hash_password,
    normalize_email,
    verify_password,
)

PASSWORD = "correct horse battery staple"


def _b64(data: dict[str, object]) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _encode(payload: dict[str, object], secret: str | None = None) -> str:
    return jwt.encode(payload, secret or get_settings().jwt_secret, algorithm="HS256")


def _valid_claims() -> dict[str, object]:
    now = datetime.now(UTC)
    return {"sub": "42", "iat": now, "exp": now + timedelta(days=1)}


# --- hashing -----------------------------------------------------------------


def test_hash_round_trip() -> None:
    password_hash = hash_password(PASSWORD)

    assert verify_password(PASSWORD, password_hash) is True
    assert verify_password("wrong password", password_hash) is False
    assert password_hash != PASSWORD
    assert PASSWORD not in password_hash
    assert password_hash.startswith("$argon2")


def test_same_password_hashes_differently_and_both_verify() -> None:
    first = hash_password(PASSWORD)
    second = hash_password(PASSWORD)

    assert first != second
    assert verify_password(PASSWORD, first) is True
    assert verify_password(PASSWORD, second) is True


@pytest.mark.parametrize("garbage", ["", "not-a-hash", "$argon2id$v=19$broken", "$2b$12$abc"])
def test_verify_password_with_garbage_hash_returns_false(garbage: str) -> None:
    assert verify_password(PASSWORD, garbage) is False


# --- tokens ------------------------------------------------------------------


def test_token_round_trip_and_expiry_window() -> None:
    settings = get_settings()
    token = create_access_token(42)

    assert decode_access_token(token) == 42

    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == "42"
    expected = timedelta(days=settings.access_token_days).total_seconds()
    assert abs((payload["exp"] - payload["iat"]) - expected) <= 5
    assert abs(payload["iat"] - datetime.now(UTC).timestamp()) <= 5


def test_expired_token_is_rejected() -> None:
    now = datetime.now(UTC)
    token = _encode({"sub": "42", "iat": now - timedelta(days=2), "exp": now - timedelta(days=1)})

    assert decode_access_token(token) is None


def test_leeway_is_positive_and_at_most_five_seconds() -> None:
    assert timedelta(0) < JWT_LEEWAY <= timedelta(seconds=5)


@pytest.mark.parametrize("skew_seconds", [1, 2])
def test_token_issued_slightly_in_the_future_is_accepted(skew_seconds: int) -> None:
    # Small clock skew between issuing and decoding must not invalidate a fresh token.
    now = datetime.now(UTC)
    iat = now + timedelta(seconds=skew_seconds)
    token = _encode({"sub": "42", "iat": iat, "exp": now + timedelta(days=1)})

    assert decode_access_token(token) == 42


def test_token_issued_far_in_the_future_is_rejected() -> None:
    now = datetime.now(UTC)
    token = _encode({"sub": "42", "iat": now + timedelta(hours=1), "exp": now + timedelta(days=1)})

    assert decode_access_token(token) is None


def test_token_expired_beyond_the_leeway_is_rejected() -> None:
    now = datetime.now(UTC)
    exp = now - JWT_LEEWAY - timedelta(seconds=60)
    token = _encode({"sub": "42", "iat": now - timedelta(days=1), "exp": exp})

    assert decode_access_token(token) is None


def test_token_signed_with_other_secret_is_rejected() -> None:
    token = _encode(_valid_claims(), secret="another-secret-that-is-at-least-32-bytes-long")

    assert decode_access_token(token) is None


def test_tampered_payload_is_rejected() -> None:
    header, _payload, signature = create_access_token(42).split(".")
    now = int(datetime.now(UTC).timestamp())
    forged_payload = _b64({"sub": "1", "iat": now, "exp": now + 3600})

    assert decode_access_token(f"{header}.{forged_payload}.{signature}") is None


def test_unsigned_alg_none_token_is_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    header = _b64({"alg": "none", "typ": "JWT"})
    payload = _b64({"sub": "42", "iat": now, "exp": now + 3600})

    assert decode_access_token(f"{header}.{payload}.") is None


def test_token_with_other_hmac_algorithm_is_rejected() -> None:
    # Same secret, different algorithm. The 52-byte dev secret is short for SHA512, so silence
    # PyJWT's key-length warning while building this test token; decoding uses HS256 only.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InsecureKeyLengthWarning)
        token = jwt.encode(_valid_claims(), get_settings().jwt_secret, algorithm="HS512")

    assert decode_access_token(token) is None


def test_token_without_sub_is_rejected() -> None:
    claims = _valid_claims()
    del claims["sub"]

    assert decode_access_token(_encode(claims)) is None


@pytest.mark.parametrize("sub", ["abc", "", "4.2", "-1", " 42", "٤٢"])
def test_token_with_non_integer_sub_is_rejected(sub: str) -> None:
    claims = _valid_claims()
    claims["sub"] = sub

    assert decode_access_token(_encode(claims)) is None


@pytest.mark.parametrize("token", ["", "not-a-jwt", "a.b.c", "random garbage string"])
def test_non_jwt_string_is_rejected(token: str) -> None:
    assert decode_access_token(token) is None


# --- email -------------------------------------------------------------------


def test_normalize_email() -> None:
    assert normalize_email("  A@B.com ") == "a@b.com"
