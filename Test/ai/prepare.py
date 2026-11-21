"""Audit the authored dataset and prepare development-only human review materials."""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
from app.ai_evaluation import evaluation_state, score
from app.ai_schemas import Extraction


def require(condition, message):
    if not condition:
        raise ValueError(message)


def prepare(output):
    source = ROOT / 'Test/ai/cases-v1.json'
    dataset = json.loads(source.read_text())
    cases = dataset['cases']
    require(len(cases) == 100 and len({c['id'] for c in cases}) == 100, 'Expected 100 unique case IDs.')
    require(len({c['request'] for c in cases}) == 100, 'Duplicate requests found.')
    require(Counter(c['split'] for c in cases) == {'dev': 60, 'test': 40}, 'Expected 60 development and 40 final cases.')
    categories = sorted({c['category'] for c in cases})
    require(len(categories) == 10, 'Expected ten categories.')
    for category in categories:
        require(Counter(c['split'] for c in cases if c['category'] == category) == {'dev': 6, 'test': 4}, 'Unbalanced category: '+category)
    # This is label/contract consistency, not model evaluation or independent semantic annotation.
    for case in cases:
        evaluation_state(case)
        require(score(case, Extraction.model_validate(case['expected']))['finalExact'], 'Inconsistent label: '+case['id'])
    output.mkdir(parents=True, exist_ok=True)
    with (output / 'dev-review.csv').open('w', newline='', encoding='utf-8-sig') as file:
        writer = csv.DictWriter(file, fieldnames=['id', 'category', 'currentMonth', 'request',
            'expectedExtraction', 'expectedFinalStatus', 'reviewer', 'decision', 'notes'])
        writer.writeheader()
        for case in cases:
            if case['split'] == 'dev':
                writer.writerow({'id': case['id'], 'category': case['category'], 'currentMonth': case['currentMonth'],
                    'request': case['request'], 'expectedExtraction': json.dumps(case['expected'], ensure_ascii=False),
                    'expectedFinalStatus': case['expectedFinalStatus'], 'reviewer': '', 'decision': 'pending', 'notes': ''})
    manifest = {'datasetVersion': dataset['version'], 'datasetSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'counts': {'total': 100, 'development': 60, 'finalTest': 40},
                'categories': categories, 'contractAudit': 'passed', 'independentSemanticReview': 'pending',
                'finalTestModelEvaluation': 'not-run', 'externalApiCalls': 0,
                'reviewFile': 'dev-review.csv', 'plannedModes': ['rules', 'plain', 'structured'],
                'repetitions': 3,
                'limitations': ['Authored synthetic draft, not a representative user sample.',
                                'The audit checks label consistency, not independent correctness.',
                                'The final 40 cases are not exported into the development review file.']}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.data/ai-evaluation/preparation')
    args = parser.parse_args()
    print(json.dumps(prepare(args.output), ensure_ascii=False, indent=2))
