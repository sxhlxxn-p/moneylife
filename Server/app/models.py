"""Plan snapshots and guest sessions. Author: sxhlxxn / 202439688."""

from sqlalchemy import JSON, BigInteger, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class GuestSession(Base):
    __tablename__ = "guest_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), unique=True)
    expires_at: Mapped[int] = mapped_column(BigInteger)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(40))
    parent_plan_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    goal_basis: Mapped[str] = mapped_column(String(24), default="net_assets")
    created_at: Mapped[int] = mapped_column(BigInteger)
    state: Mapped[dict] = mapped_column(JSON)


class Run(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (UniqueConstraint("owner_id", "request_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    plan_id: Mapped[str] = mapped_column(String(36), index=True)
    plan_version: Mapped[int] = mapped_column(Integer, default=1)
    engine_version: Mapped[str] = mapped_column(String(64))
    months: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(BigInteger)
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    monthly_results: Mapped[list] = mapped_column(JSON)
    summary: Mapped[dict] = mapped_column(JSON)


class AIProposal(Base):
    __tablename__ = "ai_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    base_plan_id: Mapped[str] = mapped_column(String(36))
    expires_at: Mapped[int] = mapped_column(BigInteger)
    message: Mapped[str] = mapped_column(String(2000))
    intents: Mapped[list] = mapped_column(JSON)
    candidate: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(128))
    prompt_version: Mapped[str] = mapped_column(String(64))
    applied_plan_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    applied_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class AIExplanation(Base):
    __tablename__ = "ai_explanations"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    text: Mapped[str] = mapped_column(String(2000))
    model: Mapped[str] = mapped_column(String(128))
    prompt_version: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer)


class PaperPlan(Base):
    __tablename__ = "paper_plans"
    __table_args__ = (UniqueConstraint("owner_id", "request_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    command: Mapped[dict] = mapped_column(JSON)
    financial_plan_id: Mapped[str] = mapped_column(String(36))
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    state: Mapped[dict] = mapped_column(JSON)
    orders: Mapped[list] = mapped_column(JSON)
    market_snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[int] = mapped_column(BigInteger)


class PaperRun(Base):
    __tablename__ = "paper_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    paper_plan_id: Mapped[str] = mapped_column(String(36), unique=True)
    engine_version: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[int] = mapped_column(BigInteger)
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)

class PaperExplanation(Base):
    __tablename__ = 'paper_explanations'

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    prompt_version: Mapped[str] = mapped_column(String(64), primary_key=True)
    model: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), index=True)
    selected_ids: Mapped[list] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(BigInteger)
