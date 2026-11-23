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
    assert len(report['checks']) == 11
    assert all(check['passed'] for check in report['checks'])
    assert report['scriptedProviderRequests'] == 13


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


def test_failure_review_counts_unique_development_cases_and_keeps_final_held_out(tmp_path):
    from app.ai_evaluation import evaluation_state, model_context, rules_extract, score
    report, _ = development_report()
    for row in report['attempts']:
        case = next(case for case in DATASET['cases'] if case['id'] == row['caseId'])
        prediction = rules_extract(case['request'], model_context(evaluation_state(case)))
        row.update(score(case, prediction), category=case['category'])
    source = tmp_path / 'report.json'
    source.write_text(json.dumps(report))
    result = load_tool('review_development').review(source, tmp_path / 'review')
    assert result['uniqueCases'] == 60 and result['attempts'] == 180
    assert result['casesCorrectEveryRepeat'] == 46
    assert result['casesWithFailure'] == 14 and result['failedAttempts'] == 42
    assert result['wrongApplications'] == 0
    assert result['failuresByCategory'] == {
        'bounded_period': 6, 'compound': 6, 'invalid_change': 1, 'relative_date': 1,
    }
    held_out = {case['id'] for case in DATASET['cases'] if case['split'] == 'test'}
    assert not held_out.intersection(row['caseId'] for row in result['failures'])
    assert result['externalApiCalls'] == 0


def test_failure_review_refuses_partial_or_stale_reports(tmp_path):
    report, _ = development_report()
    report['attempts'].pop()
    source = tmp_path / 'partial.json'
    source.write_text(json.dumps(report))
    with pytest.raises(ValueError):
        load_tool('review_development').review(source, tmp_path / 'review')
    assert not (tmp_path / 'review').exists()


def test_failure_review_refuses_attempts_without_metrics(tmp_path):
    report, _ = development_report()
    source = tmp_path / 'incomplete-metrics.json'
    source.write_text(json.dumps(report))
    with pytest.raises(ValueError, match='metrics are incomplete'):
        load_tool('review_development').review(source, tmp_path / 'review')
    assert not (tmp_path / 'review').exists()
