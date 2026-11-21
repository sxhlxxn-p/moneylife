"""Explicit migration and dry-run-first temporary-data cleanup."""
import argparse
import asyncio
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
root = Path(__file__).resolve().parents[2]
os.environ.setdefault('DATABASE_URL', f"sqlite+aiosqlite:///{root / '.data' / 'dev.db'}")
from app import database
from app.maintenance import cleanup
from sqlalchemy.ext.asyncio import AsyncSession

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['migrate', 'cleanup'])
    parser.add_argument('--apply', action='store_true', help='Delete expired temporary rows; default is counts only.')
    args = parser.parse_args()
    try:
        if args.command == 'migrate':
            await database.initialize_database()
            print('Database migrations are current.')
        else:
            async with AsyncSession(database.engine) as session:
                print({'applied': args.apply, 'rows': await cleanup(session, apply=args.apply)})
    finally:
        await database.close_database_connection()

if __name__ == '__main__':
    asyncio.run(main())
