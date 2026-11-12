from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["USER", "IT_SUPPORT", "IT_ADMIN"]
Priority = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Status = Literal["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"]
Lang = Literal["vi", "en"]


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# --- Tickets -----------------------------------------------------------------
class TicketCreate(BaseModel):
    title: str = Field(min_length=4, max_length=255)
    description: str = Field(min_length=5)
    priority: Priority = "MEDIUM"
    category_id: Optional[str] = None


class TicketUpdate(BaseModel):
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    assigned_to: Optional[str] = None
    category_id: Optional[str] = None
    resolution: Optional[str] = None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    is_internal: bool = False


# --- Users -------------------------------------------------------------------
class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)
    role: Role = "USER"


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


# --- Knowledge base ----------------------------------------------------------
class DocumentCreate(BaseModel):
    title: str = Field(min_length=4, max_length=255)
    summary: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(default="", max_length=200_000)
    topic: str = Field(default="General", min_length=1, max_length=50)


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=4, max_length=255)
    summary: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = Field(default=None, max_length=200_000)
    topic: Optional[str] = Field(default=None, min_length=1, max_length=50)


class DocumentReview(BaseModel):
    action: Literal["APPROVE", "REJECT"]
    note: Optional[str] = Field(default=None, max_length=2000)


# --- AI ----------------------------------------------------------------------
class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    lang: Lang = "vi"
