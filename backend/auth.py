"""
Minimal API-key auth — stands in for the architecture diagram's Auth & Access
Service box. Not production auth (no user identities, no roles, no token
expiry) — just enough to demonstrate the gate exists and gets enforced on
mutating endpoints.
"""
import os
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

DEMO_API_KEY = os.environ.get("CRIMELINK_API_KEY", "demo-investigator-key")


def require_api_key(x_api_key: str = Header(default=None)):
    if x_api_key != DEMO_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid X-API-Key header. Demo key is in backend/.env.example.",
        )
    return x_api_key
