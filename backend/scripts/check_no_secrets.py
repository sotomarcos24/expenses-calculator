"""Fail if tracked files look like they contain secrets.

Run from anywhere inside the repository: ``python backend/scripts/check_no_secrets.py``
(pure standard library, no dependencies). Only files tracked by git are inspected.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

# Tracked files that must never exist (the example file is allowed).
FORBIDDEN_NAME = re.compile(r"(^|/)(\.env(\..+)?|.*\.db|.*\.sqlite3?|.*\.pem|id_rsa|id_ed25519)$")
ALLOWED_NAMES = {".env.example"}

PRIVATE_KEY = re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----")
CLOUD_TOKEN = re.compile(
    r"\b(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{32,})\b"
)
DB_URL = re.compile(r"postgres(?:ql)?(?:\+\w+)?://([^:/@\s]+):([^@\s]+)@([^/\s:?]+)")

# Throwaway credentials that are fine to commit (CI service containers, docs placeholders).
PLACEHOLDER_USERS = {"user", "username", "postgres"}
PLACEHOLDER_PASSWORDS = {
    "password",
    "postgres",
    "pass",
    "secret",
    "changeme",
    "<password>",
    "<pass>",
}
PLACEHOLDER_HOSTS = {"localhost", "127.0.0.1", "host", "hostname", "ci-db", "db", "<host>"}
JWT_ASSIGNMENT = re.compile(r"JWT_SECRET\s*[=:]\s*['\"]?([^\s'\"$<{]+)")
JWT_ALLOWED_VALUES = {"ci-only-throwaway-secret-0123456789abcdef"}

SELF = Path(__file__).name


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], check=True, capture_output=True, text=True
    ).stdout
    return [f for f in out.split("\0") if f]


def check_file(path: str) -> list[str]:
    problems: list[str] = []
    name = path.rsplit("/", 1)[-1]
    if name not in ALLOWED_NAMES and FORBIDDEN_NAME.search(path):
        problems.append(f"{path}: tracked file that must stay untracked")
    if path.endswith(SELF):
        return problems
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return problems
    for lineno, line in enumerate(text.splitlines(), start=1):
        if PRIVATE_KEY.search(line):
            problems.append(f"{path}:{lineno}: private key")
        if CLOUD_TOKEN.search(line):
            problems.append(f"{path}:{lineno}: token-like string")
        for user, password, host in DB_URL.findall(line):
            if (
                user not in PLACEHOLDER_USERS
                or password not in PLACEHOLDER_PASSWORDS
                or host not in PLACEHOLDER_HOSTS
            ):
                problems.append(f"{path}:{lineno}: database URL with credentials")
        for value in JWT_ASSIGNMENT.findall(line):
            if value not in JWT_ALLOWED_VALUES and not value.startswith(("dev-only", "<", "...")):
                problems.append(f"{path}:{lineno}: JWT_SECRET with a literal value")
    return problems


def main() -> int:
    root = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True
    ).stdout.strip()
    problems: list[str] = []
    os.chdir(root)
    for path in tracked_files():
        problems.extend(check_file(path))
    if problems:
        print("Possible secrets in tracked files:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    print("No secrets found in tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
