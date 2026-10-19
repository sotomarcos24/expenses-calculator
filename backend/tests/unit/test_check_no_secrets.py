from pathlib import Path

from scripts.check_no_secrets import check_file


def _write(tmp_path: Path, name: str, content: str) -> str:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return str(path)


def test_clean_and_placeholder_files_pass(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "ok.md",
        "DATABASE_URL=postgresql+psycopg://user:password@host:5432/db\n"
        "JWT_SECRET=<output of openssl rand -hex 32>\n",
    )
    assert check_file(path) == []


def test_real_database_url_is_flagged(tmp_path: Path) -> None:
    path = _write(tmp_path, "a.txt", "postgres://app:s3cr3tvalue@db.example.com/prod\n")
    assert any("database URL" in p for p in check_file(path))


def test_private_key_and_jwt_literal_are_flagged(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        "b.txt",
        "-----BEGIN RSA PRIVATE KEY-----\nJWT_SECRET=abcdef0123456789abcdef0123456789\n",
    )
    problems = check_file(path)
    assert any("private key" in p for p in problems)
    assert any("JWT_SECRET" in p for p in problems)


def test_tracked_env_and_db_files_are_flagged() -> None:
    assert check_file("backend/.env")
    assert check_file("backend/dev.db")
    assert check_file("backend/.env.example") == []
