"""Compare owned saved paths without future prices. Author: sxhlxxn / 202439688."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.plans import get_owner
from app.paper import owned_paper, stored_run
from app.market import source
from app.investment_engine import validate_result
from app.paper_schemas import PaperComparisonCreate, PaperComparisonDetail, PaperEngineComparison

router = APIRouter(tags=['paper-comparison'])


def metrics(rows, target):
    final = rows[-1]
    return {'goalMonth': next((row.month for row in rows if row.total >= target), None),
        'finalNetAssets': final.total, 'finalCash': final.cash, 'finalSaved': final.saved,
        'firstShortageMonth': next((row.month for row in rows if row.short > 0), None),
        'shortageMonths': sum(row.short > 0 for row in rows), 'unmetTotal': final.unpaid,
        'finalInvestmentValue': final.investment.marketValue,
        'finalRealizedPnl': final.investment.realizedPnl,
        'finalUnrealizedPnl': final.investment.unrealizedPnl}


@router.post('/paper-comparisons', response_model=PaperComparisonDetail)
async def compare(payload: PaperComparisonCreate, response: Response,
                  owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    # Resolve ownership for every selection before disclosing compatibility details.
    plans = [await owned_paper(str(plan_id), owner, session) for plan_id in payload.planIds]
    runs = [await stored_run(plan, session) for plan in plans]
    first = plans[0]
    for plan, run in zip(plans, runs):
        if (plan.financial_plan_id != first.financial_plan_id or plan.state['initial'] != first.state['initial'] or
            plan.state['startMonth'] != first.state['startMonth'] or
            plan.market_snapshot['priceDataHash'] != first.market_snapshot['priceDataHash'] or
            run.engine_version != runs[0].engine_version):
            raise HTTPException(409, 'COMPARISON_INCOMPATIBLE')
    common = min(plan.state['month'] for plan in plans)
    through = common if payload.throughMonth is None else payload.throughMonth
    if through > common:
        raise HTTPException(409, 'COMPARISON_FUTURE_MONTH')
    paths = []
    try:
        for plan, run in zip(plans, runs):
            result = PaperEngineComparison.model_validate(run.result)
            if run.engine_version != result.invested.engineVersion:
                raise ValueError('Engine version mismatch')
            if (run.input_snapshot['state'] != plan.state or run.input_snapshot['orders'] != plan.orders or
                run.input_snapshot['market'] != plan.market_snapshot):
                raise ValueError('Input snapshot mismatch')
            investment = {key: plan.market_snapshot[key] for key in ('symbol', 'priceSeriesId', 'prices', 'costs')}
            investment['orders'] = plan.orders
            validate_result(result, plan.state, investment, plan.state['month'])
            rows = result.invested.monthlyResults[:through + 1]
            paths.append({'planId': plan.id, 'runId': run.id, 'name': plan.state['initial']['name'],
                'savedMonth': plan.state['month'], 'summary': metrics(rows, plan.state['initial']['target']),
                'monthlyResults': [row.model_dump() for row in rows]})
    except (ValidationError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'COMPARISON_INPUT_INVALID') from None
    base = paths[0]['summary']
    differences = []
    for path in paths[1:]:
        summary = path['summary']
        goal_difference = None if base['goalMonth'] is None or summary['goalMonth'] is None else summary['goalMonth'] - base['goalMonth']
        differences.append({'planId': path['planId'],
            'finalAssetsDifference': summary['finalNetAssets'] - base['finalNetAssets'],
            'goalMonthDifference': goal_difference,
            'shortageMonthsDifference': summary['shortageMonths'] - base['shortageMonths'],
            'unmetDifference': summary['unmetTotal'] - base['unmetTotal']})
    return {'basis': 'saved-runs-common-period', 'throughMonth': through,
        'referencePlanId': first.id, 'financialPlanId': first.financial_plan_id,
        'source': source(first.market_snapshot), 'paths': paths, 'differences': differences}
