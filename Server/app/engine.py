"""Call the shared JS engine without shell execution. Author: sxhlxxn / 202439688."""

import asyncio
import json
import os
from pathlib import Path
import shutil

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas import EngineResult


RUNNER = Path(__file__).resolve().parents[2] / "Engine" / "src" / "runner.cjs"
ENGINE_TIMEOUT = 5
slots = asyncio.Semaphore(4)


async def calculate(state: dict, months: int) -> EngineResult:
    node = shutil.which(os.getenv("NODE_BINARY", "node"))
    if not node or not RUNNER.is_file():
        raise HTTPException(status_code=503, detail="ENGINE_UNAVAILABLE")
    async with slots:
        try:
            process = await asyncio.create_subprocess_exec(
                node, str(RUNNER), stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
        except OSError:
            raise HTTPException(status_code=503, detail="ENGINE_UNAVAILABLE") from None
        try:
            stdout, _ = await asyncio.wait_for(
                process.communicate(json.dumps({"state": state, "months": months}).encode()),
                timeout=ENGINE_TIMEOUT,
            )
        except (TimeoutError, asyncio.CancelledError) as error:
            if process.returncode is None:
                process.kill()
            await process.communicate()
            if isinstance(error, asyncio.CancelledError):
                raise
            raise HTTPException(status_code=503, detail="ENGINE_TIMEOUT") from None
    if process.returncode != 0 or len(stdout) > 1_000_000:
        raise HTTPException(status_code=503, detail="ENGINE_ERROR")
    try:
        result = EngineResult.model_validate_json(stdout)
        if len(result.monthlyResults) != months + 1:
            raise ValueError("Invalid period")
        for index, row in enumerate(result.monthlyResults):
            if row.month != index or row.total != row.cash + row.saved - row.unpaid:
                raise ValueError("Inconsistent result")
        rows = result.monthlyResults
        final = rows[-1]
        goal = next((row.month for row in rows if row.total >= state["initial"]["target"]), None)
        first_shortage = next((row.month for row in rows if row.short > 0), None)
        if result.summary.model_dump() != {
            "goalMonth": goal, "finalNetAssets": final.total,
            "finalCash": final.cash, "finalSaved": final.saved,
            "firstShortageMonth": first_shortage,
            "shortageMonths": sum(row.short > 0 for row in rows),
            "unmetTotal": final.unpaid,
        }:
            raise ValueError("Inconsistent summary")
        return result
    except (ValidationError, ValueError):
        raise HTTPException(status_code=503, detail="ENGINE_OUTPUT_INVALID") from None
