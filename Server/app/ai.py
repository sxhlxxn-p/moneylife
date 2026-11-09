"""User-approved AI plan changes. Author: sxhlxxn / 202439688."""
import os
import time
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import llm
from app import ai_explanation
from app.ai_changes import build_candidate, model_context
from app.ai_schemas import ApplyChange, ApplyResult, ParseChange, ProposalResponse, ExplainRequest, ExplainResult
from app.database import get_session
from app.engine import calculate
from app.models import AIProposal, AIExplanation, Plan, Run
from app.plans import get_owner, owned_plan, summary as plan_summary
from app.simulations import detail as run_detail


router = APIRouter(prefix='/ai', tags=['ai'])


@router.post('/explain', response_model=ExplainResult)
async def explain(payload: ExplainRequest, response: Response,
                  owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    run = await session.scalar(select(Run).where(Run.id == str(payload.runId), Run.owner_id == owner))
    if run is None:
        raise HTTPException(404, detail='RUN_NOT_FOUND')
    if 'aiComparison' not in run.input_snapshot:
        raise HTTPException(422, detail='COMPARISON_REQUIRED')
    def stored(row):
        return {'text': row.text, 'source': 'llm', 'attempts': row.attempts,
                'fallbackReason': None, 'verifiedNumbers': True}
    cached = await session.get(AIExplanation, run.id)
    if cached:
        return stored(cached)
    result = await ai_explanation.generate(run.input_snapshot['aiComparison'], run.input_snapshot['aiExplanation'])
    if result['source'] == 'llm':
        session.add(AIExplanation(run_id=run.id, owner_id=owner, text=result['text'],
                    model=os.environ['LLM_MODEL'], prompt_version=ai_explanation.PROMPT_VERSION,
                    attempts=result['attempts']))
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            cached = await session.get(AIExplanation, run.id)
            if cached is None:
                raise
            return stored(cached)
    return result


@router.post('/parse-change', response_model=ProposalResponse)
async def parse_change(payload: ParseChange, response: Response,
                       owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    plan = await owned_plan(str(payload.planId), owner, session)
    if plan.state['month'] == 120:
        raise HTTPException(422, detail='SIMULATION_FINISHED')
    extraction = await llm.extract(payload.message, model_context(plan.state))
    common = {'basePlanId': plan.id, 'message': payload.message,
              'model': os.getenv('LLM_MODEL'), 'promptVersion': llm.PROMPT_VERSION}
    if extraction.status != 'ready':
        return {**common, 'status': extraction.status, 'question': extraction.question}
    try:
        candidate, preview = build_candidate(plan.state, extraction.changes)
    except (ValueError, ValidationError):
        return {**common, 'status': 'invalid_change',
                'question': '변경 후 금액이나 적용 기간이 유효하지 않습니다. 금액과 연월을 확인해주세요.'}
    proposal = AIProposal(id=str(uuid4()), owner_id=owner, base_plan_id=plan.id,
                          expires_at=int(time.time()) + 1800, message=payload.message,
                          intents=[change.model_dump() for change in extraction.changes],
                          candidate=candidate, model=os.getenv('LLM_MODEL', 'test-double'),
                          prompt_version=llm.PROMPT_VERSION)
    session.add(proposal)
    await session.commit()
    return {**common, 'status': 'ready', 'proposalId': proposal.id, 'changes': proposal.intents,
            'preview': preview, 'expiresAt': proposal.expires_at}


async def applied(proposal, owner, session):
    plan = await owned_plan(proposal.applied_plan_id, owner, session)
    run = await session.scalar(select(Run).where(Run.id == proposal.applied_run_id, Run.owner_id == owner))
    return {'plan': {**plan_summary(plan), 'state': plan.state}, 'run': run_detail(run),
            'comparison': run.input_snapshot['aiComparison'],
            'explanation': run.input_snapshot['aiExplanation'], 'explanationSource': 'template',
            'toolsExecuted': ['run_simulation:base', 'run_simulation:candidate', 'compare_plans']}


@router.post('/proposals/{proposal_id}/apply', response_model=ApplyResult)
async def apply_change(proposal_id: UUID, payload: ApplyChange, response: Response,
                       owner: str = Depends(get_owner), session: AsyncSession = Depends(get_session)):
    response.headers['Cache-Control'] = 'no-store'
    proposal = await session.scalar(select(AIProposal).where(AIProposal.id == str(proposal_id),
                                                            AIProposal.owner_id == owner))
    if proposal is None:
        raise HTTPException(404, detail='PROPOSAL_NOT_FOUND')
    if proposal.applied_plan_id:
        return await applied(proposal, owner, session)
    if proposal.expires_at <= int(time.time()):
        raise HTTPException(410, detail='PROPOSAL_EXPIRED')
    base = await owned_plan(proposal.base_plan_id, owner, session)
    # Fixed server orchestration: no model-selected executable name, URL or arbitrary tools.
    reference = await calculate(base.state, 120)
    result = await calculate(proposal.candidate, 120)
    comparison = {'baseGoalMonth': reference.summary.goalMonth, 'candidateGoalMonth': result.summary.goalMonth,
                  'finalAssetsDifference': result.summary.finalNetAssets - reference.summary.finalNetAssets,
                  'shortageMonthsDifference': result.summary.shortageMonths - reference.summary.shortageMonths}
    def goal(month):
        return '기간 내 미달성' if month is None else ('시작 시점 달성' if month == 0 else f'{month}개월차')
    explanation = (f'같은 120개월을 비교했습니다. 목표 최초 달성은 기존 {goal(reference.summary.goalMonth)}, '
                   f'변경 후 {goal(result.summary.goalMonth)}입니다. '
                   f'기간 말 총자산 차이는 {comparison["finalAssetsDifference"]:+,}원, '
                   f'현금 부족 기간 차이는 {comparison["shortageMonthsDifference"]:+d}개월입니다. '
                   '입력한 조건과 가정에 따른 계산입니다.')
    plan_id, run_id = str(uuid4()), str(uuid4())
    # Claim and both inserts commit together. Losing concurrent requests cannot create duplicate children.
    claim = await session.execute(update(AIProposal).where(AIProposal.id == proposal.id,
                                 AIProposal.applied_plan_id.is_(None)).values(
                                     applied_plan_id=plan_id, applied_run_id=run_id))
    if claim.rowcount != 1:
        await session.rollback()
        await session.refresh(proposal)
        return await applied(proposal, owner, session)
    candidate = proposal.candidate
    plan = Plan(id=plan_id, owner_id=owner, name=candidate['initial']['name'], parent_plan_id=base.id,
                schema_version=1, goal_basis='net_assets', created_at=int(time.time()), state=candidate)
    run = Run(id=run_id, owner_id=owner, request_id=proposal.id, plan_id=plan_id,
              plan_version=1, engine_version=result.engineVersion, months=120, created_at=time.time_ns() // 1000,
              input_snapshot={'schemaVersion': 1, 'goalBasis': 'net_assets', 'state': candidate, 'months': 120,
                              'aiProposalId': proposal.id, 'aiComparison': comparison, 'aiExplanation': explanation,
                              'model': proposal.model, 'promptVersion': proposal.prompt_version},
              monthly_results=[row.model_dump() for row in result.monthlyResults], summary=result.summary.model_dump())
    session.add_all([plan, run])
    await session.commit()
    await session.refresh(proposal)
    return await applied(proposal, owner, session)
