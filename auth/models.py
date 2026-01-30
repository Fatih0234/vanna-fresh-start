"""Auth request/response models."""

from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    email: str
    password: str


class UserInfo(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str = "viewer"
