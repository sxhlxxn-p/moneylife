"""Run the frozen condition-extraction comparison. Author: sxhlxxn."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
from app.ai_evaluation import configuration, evaluate_case, summarize


async def run(args):
    dataset_path = ROOT / 'Test/ai/cases-v1.json'
    dataset = json.loads(dataset_path.read_text())
    model = os.getenv('LLM_MODEL') if args.mode != 'rules' else None
    if args.mode != 'rules' and (not model or not os.getenv('OPENAI_API_KEY') or os.getenv('LLM_PROVIDER', 'openai') != 'openai'):
        raise SystemExit('LLM_NOT_CONFIGURED: configure OPENAI_API_KEY, LLM_MODEL and LLM_PROVIDER=openai. No model requests were made.')
    config = configuration(dataset_path, args.mode, model)
    if args.case_id and args.split != 'dev':
        raise SystemExit('Single-case smoke checks are development-only.')
    if args.split == 'test':
        if not args.frozen_config:
            raise SystemExit('Final test requires --frozen-config pointing to a development report.')
        frozen = json.loads(Path(args.frozen_config).read_text())
        if frozen.get('split') != 'dev' or frozen.get('uniqueCases') != 60 or frozen['configuration'] != config:
            raise SystemExit('Configuration differs from the frozen development report. Do not tune on the final test.')
    cases = [case for case in dataset['cases'] if case['split'] == args.split]
    if args.case_id:
        cases = [case for case in cases if case['id'] == args.case_id]
        if not cases:
            raise SystemExit('Unknown development case ID.')
    rows = []
    for repetition in range(1, args.repetitions + 1):
        for case in cases:
            rows.append(await evaluate_case(case, args.mode, repetition))
        print(f'{args.mode}: repetition {repetition}/{args.repetitions}, {len(rows)} attempts', file=sys.stderr)
    report = {'createdAt': datetime.now(timezone.utc).isoformat(), 'datasetVersion': dataset['version'],
              'split': args.split, 'uniqueCases': len(cases), 'repetitions': args.repetitions,
              'configuration': config, 'summary': summarize(rows),
              'byCategory': {category: summarize([row for row in rows if row['category'] == category])
                             for category in sorted({row['category'] for row in rows})}, 'attempts': rows,
              'limitations': ['Authored draft cases; not independently annotated.',
                              'Repeated attempts share cases; they are not independent samples.',
                              'No external model result exists for rules mode.',
                              'Dollar cost is unknown; token counts use provider usage when supplied.']}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'report': str(output), 'summary': report['summary']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', required=True, choices=['rules', 'plain', 'structured'])
    parser.add_argument('--split', default='dev', choices=['dev', 'test'])
    parser.add_argument('--repetitions', type=int, default=3, choices=range(1, 4))
    parser.add_argument('--frozen-config')
    parser.add_argument('--case-id', help='Development-only single-case live smoke check')
    parser.add_argument('--output', default=str(ROOT / '.data/ai-evaluation/latest.json'))
    asyncio.run(run(parser.parse_args()))
