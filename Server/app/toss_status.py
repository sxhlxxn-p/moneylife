"""Redacted, persistent diagnostics; status reads never contact Toss."""

from datetime import datetime, timezone
import hmac
import os
from pathlib import Path
import tempfile
from typing import Literal

from dotenv import dotenv_values
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import APIKeyHeader
from pydantic import Field, model_validator

from app.market import catalog_sources
from app.market_auth import readiness
from app.schemas import StrictModel

ROOT = Path(__file__).resolve().parents[2]
ERROR_CODES = (
    "MARKET_NOT_CONFIGURED",
    "MARKET_TOKEN_INVALID",
    "MARKET_TOKEN_MISSING",
    "MARKET_AUTH_FAILED",
    "MARKET_AUTH_RESPONSE_INVALID",
    "MARKET_CONNECTION_FAILED",
    "MARKET_ACCESS_DENIED",
    "MARKET_RATE_LIMITED",
    "MARKET_PROVIDER_FAILED",
    "MARKET_RESPONSE_TOO_LARGE",
    "MARKET_RESPONSE_INVALID",
    "MARKET_CURSOR_REPEATED",
    "MARKET_PAGE_LIMIT",
    "MARKET_EMPTY_DATA",
    "MARKET_REQUEST_BLOCKED",
)


class TossCheck(StrictModel):
    checkedAt: datetime
    succeeded: bool = Field(strict=True)
    error: Literal[ERROR_CODES] | None = None

    @model_validator(mode="after")
    def valid_result(self):
        if self.checkedAt.utcoffset() is None or self.succeeded != (self.error is None):
            raise ValueError("Invalid check result")
        return self


class TossStatus(StrictModel):
    configured: bool
    mode: Literal["access-token", "client-credentials", "not-configured"]
    readOnly: Literal[True] = True
    realTradingEnabled: Literal[False] = False
    registeredHistoricalSeries: int = Field(ge=0)
    lastCheck: TossCheck | None = None


def status_file() -> Path:
    return Path(os.getenv("TOSS_STATUS_FILE", str(ROOT / ".data" / "toss-status.json")))


def record_check(error: str | None = None) -> None:
    # Only fixed error codes may reach disk or the status API.
    if error is not None and error not in ERROR_CODES:
        error = "MARKET_PROVIDER_FAILED"
    result = TossCheck(checkedAt=datetime.now(timezone.utc), succeeded=error is None, error=error)
    path = status_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(result.model_dump_json())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def read_check() -> TossCheck | None:
    path = status_file()
    try:
        if not path.exists():
            return None
        if path.is_symlink() or path.stat().st_size > 4096:
            raise ValueError("Invalid status file")
        return TossCheck.model_validate_json(path.read_bytes())
    except (OSError, ValueError):
        raise HTTPException(503, "TOSS_STATUS_UNAVAILABLE") from None


operator_header = APIKeyHeader(name="X-Moneylife-Operator-Key", auto_error=False)


def require_operator(key: str | None = Depends(operator_header)) -> None:
    file = ROOT / "Server" / ".env"
    values = dotenv_values(file, interpolate=False) if file.is_file() else {}
    expected = str(os.environ.get("TOSS_OPERATOR_KEY", values.get("TOSS_OPERATOR_KEY") or ""))
    if len(expected.strip()) < 32:
        raise HTTPException(503, "TOSS_OPERATOR_NOT_CONFIGURED")
    if not key or not hmac.compare_digest(key.encode(), expected.encode()):
        raise HTTPException(401, "TOSS_OPERATOR_UNAUTHORIZED")


router = APIRouter(prefix="/integrations/toss", tags=["toss-integration"])


@router.get(
    "/status",
    response_model=TossStatus,
    dependencies=[Depends(require_operator)],
    summary="토스 읽기 전용 연동 상태",
    description="운영자 전용. 저장된 검사 결과만 조회하며 외부 호출·토큰 발급·실거래를 수행하지 않습니다.",
    responses={
        401: {"description": "운영자 키 누락 또는 불일치"},
        503: {"description": "운영자 키 미설정 또는 상태·가격 목록 읽기 실패"},
    },
)
async def status(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return TossStatus(
        **readiness(),
        registeredHistoricalSeries=sum(
            source["dataKind"] == "historical-market" for source in catalog_sources()
        ),
        lastCheck=read_check(),
    )
