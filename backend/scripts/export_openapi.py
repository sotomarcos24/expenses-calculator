"""Export the backend OpenAPI document to ``openapi.json`` at the repository root.

Run from ``backend/``::

    uv run python -m scripts.export_openapi          # write ../openapi.json
    uv run python -m scripts.export_openapi --check  # exit 1 if ../openapi.json is stale

The output is deterministic: it does not start a server, does not touch the database and
does not depend on environment variables or ``backend/.env`` (the title is pinned to the
default ``APP_NAME``).
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.config import Settings
from app.main import create_app

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"
DEFAULT_TITLE = f"{Settings.model_fields['app_name'].default} API"


def build_openapi() -> dict[str, Any]:
    app = create_app()
    # Pin the title so a local APP_NAME (env var or .env) does not change the document.
    app.title = DEFAULT_TITLE
    app.openapi_schema = None
    return app.openapi()


def render_openapi() -> str:
    return json.dumps(build_openapi(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument(
        "--check",
        action="store_true",
        help="do not write; exit 1 if the committed openapi.json differs",
    )
    args = parser.parse_args(argv)

    content = render_openapi()
    if args.check:
        current = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else None
        if current != content:
            print(
                f"{OUTPUT_PATH.name} is out of date. Run `uv run python -m scripts.export_openapi`"
                " in backend/, then `npm run gen:api` in frontend/, and commit both files.",
                file=sys.stderr,
            )
            return 1
        print(f"{OUTPUT_PATH.name} is up to date.")
        return 0

    OUTPUT_PATH.write_text(content, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
