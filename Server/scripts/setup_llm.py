"""Configure local model credentials through hidden input. Author: sxhlxxn / 202439688."""
import getpass
import os
from pathlib import Path
import sys
import tempfile

from dotenv import dotenv_values, set_key

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
from app.settings import ENV_FILE


def write_settings(path, model, key):
    if not model.strip() or model.startswith('sk-') or any(c in model for c in '\r\n'):
        raise ValueError('모델 ID를 확인해주세요.')
    if not key.strip() or any(c in key for c in '\r\n'):
        raise ValueError('API 키를 확인해주세요.')
    if path.is_symlink():
        raise ValueError('심볼릭 링크인 설정 파일에는 쓰지 않습니다.')
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.env.', dir=path.parent)
    os.close(descriptor)
    try:
        with open(temporary, 'w', encoding='utf-8') as output:
            output.write(path.read_text() if path.exists() else '# Local MoneyLife settings\n')
        for name, value in {'LLM_PROVIDER': 'openai', 'LLM_MODEL': model.strip(), 'OPENAI_API_KEY': key.strip()}.items():
            set_key(temporary, name, value, quote_mode='always')
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    if not sys.stdin.isatty():
        raise SystemExit('대화형 터미널에서 실행해주세요. 키를 명령 인자로 받지 않습니다.')
    existing = dotenv_values(ENV_FILE, interpolate=False) if ENV_FILE.exists() else {}
    model = input('사용할 모델 ID (기존 설정 유지: Enter): ').strip() or existing.get('LLM_MODEL') or ''
    key = getpass.getpass('OpenAI API 키 (입력 내용 숨김, 기존 설정 유지: Enter): ').strip() or existing.get('OPENAI_API_KEY') or ''
    try:
        write_settings(ENV_FILE, model, key)
    except (ValueError, OSError):
        raise SystemExit('설정을 저장하지 못했습니다. 모델 ID·키 입력과 파일 권한을 확인해주세요.') from None
    print('Server/.env에 설정을 저장했습니다. API 서버를 재시작한 뒤 npm run check:llm -- --live로 확인하세요.')


if __name__ == '__main__':
    main()
