"""Parse server Python sources without importing the application or connecting to services."""
import ast
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = sorted(root.rglob('*.py'))
for file in files:
    if '__pycache__' not in file.parts:
        ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
print(f'Server Python syntax checked: {len(files)} files.')
