import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError

from app.database import check_database_connection, close_database_connection, initialize_database, database_kind
from app.plans import router as plans_router
from app.simulations import router as simulations_router
from app.ai import router as ai_router
from app.paper import router as paper_router
from app.paper_explanation_api import router as paper_explanation_router


class HealthResponse(BaseModel):
    status: str


class DatabaseHealthResponse(BaseModel):
    status: str
    database: str


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await initialize_database()
    try:
        yield
    finally:
        await close_database_connection()


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
    lifespan=lifespan,
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

app.include_router(plans_router)
app.include_router(simulations_router)
app.include_router(ai_router)
app.include_router(paper_router)
app.include_router(paper_explanation_router)


@app.exception_handler(SQLAlchemyError)
async def database_error(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "DATABASE_UNAVAILABLE"})


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


@app.get(
    "/health/db",
    tags=["system"],
    summary="PostgreSQL 연결 상태 확인",
    response_description="PostgreSQL 연결 상태",
    response_model=DatabaseHealthResponse,
    responses={503: {"model": DatabaseHealthResponse}},
)
async def database_health() -> DatabaseHealthResponse | JSONResponse:
    try:
        await check_database_connection()
    except (SQLAlchemyError, RuntimeError):
        response = DatabaseHealthResponse(
            status="unavailable",
            database=database_kind(),
        )
        return JSONResponse(status_code=503, content=response.model_dump())

    return DatabaseHealthResponse(status="ok", database=database_kind())
