const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON_BINARY || (existsSync(localPython) ? localPython : 'python3');
const pythonPath = [path.join(root, 'Server'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  env: { ...process.env, PYTHONPATH: pythonPath },
  stdio: 'inherit',
});
if (result.error) {
  console.error('Python을 실행하지 못했습니다. .venv를 준비하거나 PYTHON_BINARY를 지정해주세요.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
