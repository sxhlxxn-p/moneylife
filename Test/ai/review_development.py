"""Summarize a complete development run without evaluating held-out cases or models."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
from app.ai_evaluation import configuration, validate_frozen_development


def review(report_path, output):
    dataset_path = ROOT / 'Test/ai/cases-v1.json'
    dataset = json.loads(dataset_path.read_text())
    report = json.loads(report_path.read_text())
    saved = report.get('configuration', {})
    mode = saved.get('mode')
    if mode not in ('rules', 'plain', 'structured'):
        raise ValueError('Unknown evaluation mode.')
    config = configuration(dataset_path, mode, saved.get('model'))
    validate_frozen_development(report, config, dataset, 3)
    cases = {case['id']: case for case in dataset['cases'] if case['split'] == 'dev'}
    attempts = report['attempts']
    for row in attempts:
        if (any(type(row.get(key)) is not bool
                for key in ('rawExact', 'finalExact', 'wrongApplication'))
                or row.get('finalStatus') not in
                ('ready', 'needs_clarification', 'unsupported', 'invalid_change', 'error')
                or row.get('category') != cases[row['caseId']]['category']):
            raise ValueError('Development attempt metrics are incomplete or inconsistent.')
    failures = []
    for case_id, case in cases.items():
        rows = [row for row in attempts if row['caseId'] == case_id]
        failed = [row for row in rows if not row.get('finalExact')]
        if not failed:
            continue
        if any(row.get('wrongApplication') for row in failed):
            reason = 'incorrect_valid_change'
        elif any(row.get('error') for row in failed):
            reason = 'request_or_format_error'
        elif all(row.get('finalStatus') == 'needs_clarification' for row in failed):
            reason = 'clarification_instead_of_resolved_request'
        elif any(row.get('finalStatus') != case['expectedFinalStatus'] for row in failed):
            reason = 'final_status_mismatch'
        else:
            reason = 'condition_mismatch'
        failures.append({
            'caseId': case_id, 'category': case['category'], 'request': case['request'],
            'expectedFinalStatus': case['expectedFinalStatus'],
            'observedFinalStatuses': sorted({row.get('finalStatus', 'missing') for row in rows}),
            'failedRepetitions': [row['repetition'] for row in failed],
            'reason': reason,
        })
    summary = {
        'kind': 'development-failure-review', 'mode': mode, 'configuration': config,
        'split': 'dev', 'uniqueCases': len(cases), 'attempts': len(attempts),
        'repetitions': 3, 'casesCorrectEveryRepeat': len(cases) - len(failures),
        'casesWithFailure': len(failures),
        'failedAttempts': sum(not row.get('finalExact') for row in attempts),
        'wrongApplications': sum(bool(row.get('wrongApplication')) for row in attempts),
        'failuresByCategory': dict(sorted(Counter(row['category'] for row in failures).items())),
        'failures': failures, 'externalApiCalls': 0,
        'limitations': [
            'This report analyzes existing development attempts; it makes no model calls.',
            'Repeated attempts use the same 60 cases, not 180 independent sentences.',
            'Reason labels describe observed output behavior, not the cause inside a model.',
            'Authored data is not independently annotated or representative of users.',
            'No held-out predictions or final-test tuning are included.',
        ],
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    with (output / 'failures.csv').open('w', newline='', encoding='utf-8-sig') as file:
        fields = ['caseId', 'category', 'request', 'expectedFinalStatus',
                  'observedFinalStatuses', 'failedRepetitions', 'reason']
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(failures)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / '.data/ai-evaluation/development-review')
    args = parser.parse_args()
    result = review(args.report, args.output)
    print(json.dumps({key: value for key, value in result.items() if key != 'failures'},
                     ensure_ascii=False, indent=2))
