"""Investment listings must preserve ownership, paging and bounded query count."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import delete, event, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import database
from app.models import PaperRun
from test_paper_trading import start


@pytest.mark.parametrize("count", [1, 5])
def test_listing_fetches_plans_and_runs_in_one_query(client, payload, count):
    plans = [start(client, payload)[0]["plan"] for _ in range(count)]
    queries = []

    def record(_connection, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and "paper_" in statement:
            queries.append(statement)

    event.listen(database.engine.sync_engine, "before_cursor_execute", record)
    try:
        response = client.get("/paper-plans?limit=2&offset=0")
    finally:
        event.remove(database.engine.sync_engine, "before_cursor_execute", record)
    assert response.status_code == 200
    expected = sorted(plans, key=lambda p: (p["createdAt"], p["id"]), reverse=True)[:2]
    assert [plan["id"] for plan in response.json()] == [plan["id"] for plan in expected]
    assert len(queries) == 1
    assert "paper_runs.result" not in queries[0]
    assert "paper_runs.input_snapshot" not in queries[0]
    assert all("state" not in plan and "orders" not in plan for plan in response.json())
    client.cookies.clear()
    assert client.get("/paper-plans").json() == []


@pytest.mark.parametrize("corruption", ["missing-run", "different-owner"])
def test_listing_does_not_hide_missing_or_unowned_results(client, payload, corruption):
    plan = start(client, payload)[0]["plan"]

    async def corrupt():
        async with AsyncSession(database.engine) as session:
            statement = (
                delete(PaperRun)
                if corruption == "missing-run"
                else update(PaperRun).values(owner_id=str(uuid4()))
            )
            await session.execute(statement.where(PaperRun.paper_plan_id == plan["id"]))
            await session.commit()

    asyncio.run(corrupt())
    response = client.get("/paper-plans")
    assert response.status_code == 503
    assert response.json()["detail"] == "PAPER_RUN_UNAVAILABLE"
