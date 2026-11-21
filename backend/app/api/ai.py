"""AI Investigation Assistant API."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.ai.engine import SUGGESTIONS, answer, llm_available
from backend.app.ai.tools import TOOLS
from backend.app.api.common import J, not_found
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models import AIConversation, AIMessage
from backend.app.security.auth import CurrentUser, require
from backend.app.services.settings import get_setting
from backend.app.services.tenancy import record_audit

router = APIRouter()


class AskBody(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    conversation_id: str | None = None
    period_start: date
    period_end: date


@router.get("/ai/status")
def status(user: CurrentUser = Depends(require("read"))):
    return {"mode": "llm" if llm_available() else "deterministic", "provider": settings.LLM_PROVIDER or None,
            "model": settings.LLM_MODEL or None, "can_query": user.can("ai:query"),
            "tools": [{"name": t.name, "description": t.description} for t in TOOLS.values()], "suggestions": SUGGESTIONS,
            "note": "Answers are computed only from read-only, tenant-scoped tools over reconciled data. The assistant cannot change records."}


@router.post("/ai/ask")
def ask(body: AskBody, user: CurrentUser = Depends(require("ai:query")), db: Session = Depends(get_db)):
    if body.period_end < body.period_start:
        raise HTTPException(422, "period_end must be on or after period_start")
    conv = None
    history: list[dict] = []
    if body.conversation_id:
        conv = db.get(AIConversation, body.conversation_id)
        if conv is None or conv.tenant_id != user.tenant_id or conv.user_id != user.id:
            raise not_found("Conversation")
        history = [{"role": m.role, "content": m.content} for m in db.scalars(
            select(AIMessage).where(AIMessage.conversation_id == conv.id).order_by(AIMessage.id))]
    cfg = get_setting(db, user.tenant_id, "ai")
    a = answer(db, user.tenant_id, body.question.strip(), (body.period_start, body.period_end), history, int(cfg.get("max_tool_calls", 6)))
    db.rollback()  # every tool is read-only; discard anything a tool may have touched before writing the log
    calls = [{"tool": c.tool, "args": c.args, "ms": c.ms, "error": c.error or None,
              "source": c.result.source if c.result else [], "definition": c.result.definition if c.result else "",
              "row_count": len(c.result.rows) if c.result else 0,
              "summary": c.result.summary if c.result else None} for c in a.calls]
    blocks = [{**c.result.block, "rows": c.result.rows, "tool": c.tool} for c in a.calls if c.result and c.result.block]
    payload = J({"tool_calls": calls, "blocks": blocks, "suggestions": a.suggestions, "notice": a.notice, "refused": a.refused})
    if conv is None:
        conv = AIConversation(tenant_id=user.tenant_id, user_id=user.id, title=body.question.strip()[:200])
        db.add(conv)
        db.flush()
    db.add(AIMessage(tenant_id=user.tenant_id, conversation_id=conv.id, role="user", content=body.question.strip(),
                     payload={"period_start": body.period_start.isoformat(), "period_end": body.period_end.isoformat()}))
    msg = AIMessage(tenant_id=user.tenant_id, conversation_id=conv.id, role="assistant", content=a.text, mode=a.mode, payload=payload)
    db.add(msg)
    record_audit(db, user.tenant_id, user.id, "AI_QUERY", "ai_conversation", conv.id, mode=a.mode, tools=[c.tool for c in a.calls])
    db.commit()
    return {"conversation_id": conv.id, "message_id": msg.id, "answer": a.text, "mode": a.mode, **payload}


@router.get("/ai/conversations")
def conversations(user: CurrentUser = Depends(require("ai:query")), db: Session = Depends(get_db)):
    rows = db.scalars(select(AIConversation).where(AIConversation.tenant_id == user.tenant_id, AIConversation.user_id == user.id)
                      .order_by(AIConversation.updated_at.desc()).limit(50))
    return J([{"id": c.id, "title": c.title, "updated_at": c.updated_at} for c in rows])


@router.get("/ai/conversations/{cid}")
def conversation(cid: str, user: CurrentUser = Depends(require("ai:query")), db: Session = Depends(get_db)):
    c = db.get(AIConversation, cid)
    if c is None or c.tenant_id != user.tenant_id or c.user_id != user.id:
        raise not_found("Conversation")
    msgs = db.scalars(select(AIMessage).where(AIMessage.conversation_id == c.id).order_by(AIMessage.id))
    return J({"id": c.id, "title": c.title, "messages": [{"id": m.id, "role": m.role, "content": m.content, "mode": m.mode,
                                                          "created_at": m.created_at, **(m.payload if m.role == "assistant" else {})} for m in msgs]})


@router.delete("/ai/conversations/{cid}")
def delete_conversation(cid: str, user: CurrentUser = Depends(require("ai:query")), db: Session = Depends(get_db)):
    c = db.get(AIConversation, cid)
    if c is None or c.tenant_id != user.tenant_id or c.user_id != user.id:
        raise not_found("Conversation")
    db.delete(c)
    db.commit()
    return {"ok": True}
