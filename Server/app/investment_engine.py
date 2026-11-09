"""Validate monthly investment engine outputs. Author: sxhlxxn / 202439688."""
from fastapi import HTTPException
from pydantic import ValidationError
from app.engine import run_engine
from app.paper_schemas import PaperEngineComparison


def validate_result(result: PaperEngineComparison, state: dict, investment: dict, months: int):
    target = state['initial']['target']
    for path in (result.baseline, result.invested):
        rows = path.monthlyResults
        if len(rows) != months + 1:
            raise ValueError('period')
        for index, row in enumerate(rows):
            value = row.investment.marketValue if hasattr(row, 'investment') else 0
            if row.month != index or row.total != row.cash + row.saved + value - row.unpaid:
                raise ValueError('assets')
        final = rows[-1]
        metrics = {
            'goalMonth': next((r.month for r in rows if r.total >= target), None),
            'finalNetAssets': final.total, 'finalCash': final.cash, 'finalSaved': final.saved,
            'firstShortageMonth': next((r.month for r in rows if r.short > 0), None),
            'shortageMonths': sum(r.short > 0 for r in rows), 'unmetTotal': final.unpaid,
        }
        if hasattr(final, 'investment'):
            metrics.update(finalInvestmentValue=final.investment.marketValue,
                           finalRealizedPnl=final.investment.realizedPnl,
                           finalUnrealizedPnl=final.investment.unrealizedPnl)
        if metrics != path.summary.model_dump():
            raise ValueError('summary')
    inv = result.invested
    if inv.priceSeriesId != investment['priceSeriesId']:
        raise ValueError('series')
    prices = {q['month']: q for q in investment['prices']}
    price, price_month = None, None
    for row in inv.monthlyResults:
        quote = prices.get(row.month)
        if quote and quote['price'] is not None:
            price, price_month = quote['price'], row.month
        p = row.investment
        if (p.price, p.priceMonth, p.stale) != (price, price_month, price_month != row.month):
            raise ValueError('valuation source')
        if p.marketValue != p.quantity * (price or 0) or p.unrealizedPnl != p.marketValue - p.costBasis:
            raise ValueError('valuation')
    due = sorted((o for o in investment['orders'] if o['submittedMonth'] < months),
                 key=lambda o: (o['submittedMonth'], o['side'] != 'sell'))
    if len(due) != len(inv.executions):
        raise ValueError('execution count')
    for order, execution in zip(due, inv.executions):
        intent = {k: v for k, v in order.items() if k != 'submittedMonth'}
        if execution.order.model_dump() != intent or execution.submittedMonth != order['submittedMonth'] or execution.executionMonth != order['submittedMonth'] + 1:
            raise ValueError('execution intent')
        quote = prices.get(execution.executionMonth)
        if execution.status == 'filled':
            if not quote or not quote['tradable'] or execution.price != quote['price']:
                raise ValueError('execution price')
            if execution.gross != execution.price * execution.order.quantity:
                raise ValueError('execution gross')
    if [o.model_dump() for o in inv.pendingOrders] != [o for o in investment['orders'] if o['submittedMonth'] == months]:
        raise ValueError('pending orders')
    account, final = inv.account, inv.monthlyResults[-1]
    position = final.investment
    if account.symbol != investment['symbol'] or account.initialCash != state['initial']['cash']:
        raise ValueError('account origin')
    if account.cash != final.cash or any(getattr(account, k) != getattr(position, k) for k in ('quantity', 'costBasis', 'realizedPnl', 'feesPaid', 'taxesPaid')):
        raise ValueError('account totals')
    if account.cash + account.costBasis != account.initialCash + account.netCashFlow + account.realizedPnl:
        raise ValueError('account identity')
    if [e.model_dump() for e in account.executions] != [e.model_dump(exclude={'submittedMonth', 'executionMonth'}) for e in inv.executions]:
        raise ValueError('execution ledger')
    base, invested = result.baseline.summary, inv.summary
    goal = None if base.goalMonth is None or invested.goalMonth is None else invested.goalMonth - base.goalMonth
    if result.comparison.model_dump() != {
        'finalAssetsDifference': invested.finalNetAssets - base.finalNetAssets,
        'goalMonthDifference': goal,
        'shortageMonthsDifference': invested.shortageMonths - base.shortageMonths,
    }:
        raise ValueError('comparison')

async def calculate_investment(state: dict, investment: dict, months: int) -> PaperEngineComparison:
    output = await run_engine({'mode': 'monthly-investment', 'state': state, 'investment': investment, 'months': months}, max_output=2_000_000)
    try:
        result = PaperEngineComparison.model_validate_json(output)
        validate_result(result, state, investment, months)
        return result
    except (ValidationError, ValueError):
        raise HTTPException(503, 'ENGINE_OUTPUT_INVALID') from None
