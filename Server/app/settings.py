"""Local LLM settings without overriding deployment env. Author: sxhlxxn / 202439688."""
import os
from pathlib import Path

from dotenv import dotenv_values

LLM_KEYS = ('LLM_PROVIDER', 'LLM_MODEL', 'OPENAI_API_KEY')
ENV_FILE = Path(__file__).resolve().parents[1] / '.env'


def load_llm_settings(path: Path = ENV_FILE):
    if not path.is_file():
        return
    values = dotenv_values(path, interpolate=False)
    for key in LLM_KEYS:
        if key not in os.environ and isinstance(values.get(key), str):
            os.environ[key] = values[key]


def configuration_status():
    missing = [key for key in ('OPENAI_API_KEY', 'LLM_MODEL') if not os.getenv(key, '').strip()]
    supported = os.getenv('LLM_PROVIDER', 'openai') == 'openai'
    return {'configured': not missing and supported, 'missing': missing,
            'providerSupported': supported, 'keyPresent': bool(os.getenv('OPENAI_API_KEY', '').strip()),
            'modelPresent': bool(os.getenv('LLM_MODEL', '').strip())}
