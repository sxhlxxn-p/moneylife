"""Plan snapshots and guest sessions. Author: sxhlxxn / 202439688."""

from sqlalchemy import JSON, BigInteger, Integer, String
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
