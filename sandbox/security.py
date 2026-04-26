"""AST-based security scanner: blocks dangerous imports before execution."""

import ast

BLOCKED_MODULES = frozenset([
    "os", "sys", "subprocess", "socket", "shutil", "pathlib",
    "builtins", "importlib", "ctypes", "multiprocessing", "threading",
    "signal", "pty", "tty", "termios", "fcntl", "mmap",
    "http", "urllib", "requests", "httpx", "aiohttp", "ftplib",
    "smtplib", "imaplib", "poplib", "xmlrpc", "pickle", "marshal",
    "shelve", "dbm", "sqlite3", "psycopg2", "asyncio",
])

BLOCKED_BUILTINS = frozenset(["exec", "eval", "compile", "__import__", "open"])


class SecurityError(Exception):
    pass


def check_code(code: str) -> None:
    """Raise SecurityError if code contains dangerous patterns."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise SyntaxError(f"Syntax error: {e}") from e

    for node in ast.walk(tree):
        # Block dangerous imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in BLOCKED_MODULES:
                    raise SecurityError(f"Import of '{alias.name}' is not allowed in the sandbox")

        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            root = module.split(".")[0]
            if root in BLOCKED_MODULES:
                raise SecurityError(f"Import from '{module}' is not allowed in the sandbox")

        # Block dangerous builtins
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_BUILTINS:
                raise SecurityError(f"Call to '{node.func.id}' is not allowed in the sandbox")

        # Block attribute access to __builtins__ etc.
        if isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__") and node.attr not in ("__init__", "__len__", "__str__", "__repr__", "__class__", "__name__"):
                raise SecurityError(f"Dunder attribute '{node.attr}' access is not allowed")
