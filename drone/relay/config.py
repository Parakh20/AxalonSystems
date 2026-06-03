# drone/relay/config.py
"""Env-driven relay configuration. No secrets in code (project security rule)."""
from __future__ import annotations

import os


def drone_tokens() -> dict[str, str]:
    """Parse DRONE_TOKENS='id1:tok1,id2:tok2' into {id: tok}."""
    raw = os.getenv("DRONE_TOKENS", "").strip()
    out: dict[str, str] = {}
    for pair in filter(None, (p.strip() for p in raw.split(","))):
        drone_id, _, token = pair.partition(":")
        if drone_id and token:
            out[drone_id] = token
    return out


def ops_token() -> str:
    return os.getenv("OPS_TOKEN", "")
