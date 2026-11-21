"""Offline integration and evaluation preparation must never call a live provider."""
import csv
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest
from app.ai_evaluation import configuration, validate_frozen_development

ROOT = Path(__file__).resolve().parents[2]
DATASET = json.loads((ROOT / 'Test/ai/cases-v1.json').read_text())


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f'Test/ai/{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_offline_flow_uses_real_approval_engine_and_scripted_transport():
    report = load_tool('check_offline').run_checks()
    assert report['externalApiCalls'] == 0
    assert len(report['checks']) == 9
    assert all(check['passed'] for check in report['checks'])
    assert report['scriptedProviderRequests'] == 11


def test_preparation_exports_only_development_cases(tmp_path):
    manifest = load_tool('prepare').prepare(tmp_path)
    assert manifest['counts'] == {'total': 100, 'development': 60, 'finalTest': 40}
    assert manifest['independentSemanticReview'] == 'pending'
    with (tmp_path / 'dev-review.csv').open(encoding='utf-8-sig') as file:
        rows = list(csv.DictReader(file))
    assert len(rows) == 60
    assert {row['id'] for row in rows} == {case['id'] for case in DATASET['cases'] if case['split'] == 'dev'}
    assert all(row['decision'] == 'pending' for row in rows)


def development_report():
    config = configuration(ROOT / 'Test/ai/cases-v1.json', 'rules', None)
    report = {'split': 'dev', 'uniqueCases': 60, 'repetitions': 3, 'configuration': config,
              'attempts': [{'caseId': case['id'], 'repetition': repetition}
                           for case in DATASET['cases'] if case['split'] == 'dev'
                           for repetition in range(1, 4)]}
    return report, config


def test_complete_three_repeat_configuration_can_be_frozen():
    report, config = development_report()
    validate_frozen_development(report, config, DATASET, 3)


@pytest.mark.parametrize('problem', ['missing', 'duplicate', 'test-case', 'one-repeat', 'changed-config'])
def test_incomplete_or_changed_development_report_cannot_unlock_final_test(problem):
    report, config = development_report()
    if problem == 'missing':
        report['attempts'].pop()
    elif problem == 'duplicate':
        report['attempts'][-1] = report['attempts'][0]
    elif problem == 'test-case':
        report['attempts'][-1]['caseId'] = next(c['id'] for c in DATASET['cases'] if c['split'] == 'test')
    elif problem == 'one-repeat':
        report['repetitions'] = 1
    else:
        report['configuration'] = {**config, 'model': 'different-model'}
    with pytest.raises(ValueError):
        validate_frozen_development(report, config, DATASET, 3)


def test_model_mode_needs_explicit_live_flag_even_when_environment_has_keys(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'offline-placeholder')
    monkeypatch.setenv('LLM_MODEL', 'offline-fixture')
    result = subprocess.run([sys.executable, str(ROOT / 'Test/ai/evaluate.py'), '--mode', 'structured',
                             '--output', str(tmp_path/'report.json')], capture_output=True, text=True)
    assert result.returncode != 0
    assert 'requires --allow-live' in result.stderr
    assert not (tmp_path/'report.json').exists()
