"""Local API launcher without Docker. Author: sxhlxxn / 202439688."""

import os
from pathlib import Path
import sys

import uvicorn


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    (root / ".data").mkdir(exist_ok=True)
    # PostgreSQL remains the Compose default. This command explicitly selects SQLite.
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{root / '.data' / 'dev.db'}")
    sys.path.insert(0, str(root / "Server"))
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.getenv("API_PORT", "3000")))
