import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


app = FastAPI(
    title="MoneyLife API",
    summary="금융 미래 시뮬레이션 API",
    description=(
        "현재 재무 상태와 생애 이벤트를 바탕으로 금융 계획을 저장하고 "
        "시뮬레이션하는 MoneyLife 백엔드 API입니다."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {
            "name": "system",
            "description": "서버 상태와 운영 확인을 위한 엔드포인트",
        }
    ],
)

client_origin = os.getenv("CLIENT_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[client_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get(
    "/health",
    tags=["system"],
    summary="서버 상태 확인",
    response_description="정상 동작 상태",
    response_model=HealthResponse,
)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
