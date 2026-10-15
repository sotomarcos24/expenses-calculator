"""The simulator package stays pure: no I/O, DB, web framework, clock, randomness or float."""

import ast
from pathlib import Path

import app.simulator

FORBIDDEN_MODULES = {
    "fastapi",
    "sqlalchemy",
    "starlette",
    "pydantic",
    "random",
    "datetime",
    "time",
    "os",
    "pathlib",
    "requests",
    "httpx",
    "app.db",
    "app.models",
    "app.services",
    "app.routers",
}


def test_simulator_modules_are_pure() -> None:
    files = sorted(Path(app.simulator.__file__).parent.glob("*.py"))
    assert len(files) >= 3
    for path in files:
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                modules = [node.module or ""]
            else:
                modules = []
            for module in modules:
                root = module.split(".")[0]
                assert root not in FORBIDDEN_MODULES, f"{path.name} imports {module}"
                assert module not in FORBIDDEN_MODULES, f"{path.name} imports {module}"
            if isinstance(node, ast.Name):
                assert node.id != "float", f"{path.name} uses float"
