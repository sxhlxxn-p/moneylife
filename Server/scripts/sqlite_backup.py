"""Consistent SQLite backup and non-overwriting restore; stop the API before restore."""
import argparse
import os
from pathlib import Path
import sqlite3


def copy_database(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file():
        raise ValueError('Source database does not exist.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Reserve the destination exclusively: never replace an existing DB or backup.
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with sqlite3.connect(source.as_uri()+'?mode=ro', uri=True) as original:
            if original.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('Source integrity check failed.')
            with sqlite3.connect(destination) as target:
                original.backup(target)
                if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Backup integrity check failed.')
        destination.chmod(0o600)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['backup', 'restore'])
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    copy_database(args.source, args.destination)
    print(f'{args.command} completed; integrity check passed.')
