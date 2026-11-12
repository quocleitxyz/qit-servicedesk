from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_token, hash_password, verify_password
from app.models import User
from app.schemas import ChangePasswordRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_dict(user: User) -> dict:
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    return {
        "access_token": create_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_dict(user),
    }


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_dict(user)


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "wrong_current_password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password changed"}
