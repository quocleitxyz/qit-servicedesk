from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User

bearer = HTTPBearer(auto_error=False)

STAFF_ROLES = ("IT_SUPPORT", "IT_ADMIN")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing_token")
    payload = decode_token(credentials.credentials)
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user_inactive")
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "staff_required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "IT_ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin_required")
    return user
