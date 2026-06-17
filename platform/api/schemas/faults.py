"""Fault request schemas (status update, comments)."""
from __future__ import annotations

from pydantic import BaseModel


class FaultUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class CommentCreate(BaseModel):
    body: str | None = None
    author: str | None = None
