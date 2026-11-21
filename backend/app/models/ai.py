"""AI Investigation Assistant conversation log. Every answer stores the exact tool calls (name, validated
arguments, returned rows) it was grounded on, so any figure shown can be traced back to a query."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TenantMixin, TimestampMixin, new_uuid
from backend.app.models.identity import JSONType


class AIConversation(Base, TenantMixin, TimestampMixin):
    __tablename__ = "ai_conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)


class AIMessage(Base, TenantMixin):
    __tablename__ = "ai_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user / assistant
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    mode: Mapped[str] = mapped_column(String(16), default="", nullable=False)  # deterministic / llm
    payload: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)  # blocks, tool calls, suggestions
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
