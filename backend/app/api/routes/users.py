from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, require_admin, require_staff
from app.core.database import get_db
from app.core.security import hash_password
from app.models import User
from app.schemas import PasswordReset, UserCreate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User)
                     .where(User.role == "IT_ADMIN", User.is_active.is_(True))) or 0


def _get_user(user_id: str, db: Session) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found")
    return user


@router.get("/staff")
def list_staff(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    """IT members a ticket can be assigned to."""
    staff = db.scalars(select(User).where(User.role.in_(STAFF_ROLES), User.is_active.is_(True))
                       .order_by(User.full_name)).all()
    return [{"id": u.id, "full_name": u.full_name, "role": u.role} for u in staff]


@router.get("")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [user_dict(u) for u in db.scalars(select(User).order_by(User.created_at)).all()]


@router.post("")
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "email_exists")
    user = User(full_name=body.full_name.strip(), email=email,
                password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_dict(user)


@router.patch("/{user_id}")
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    user = _get_user(user_id, db)
    data = body.model_dump(exclude_unset=True, exclude_none=True)

    loses_admin = user.role == "IT_ADMIN" and user.is_active and (
        data.get("role", "IT_ADMIN") != "IT_ADMIN" or data.get("is_active") is False)
    if loses_admin:
        if user.id == admin.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot_change_self")
        if _active_admins(db) <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "last_admin")

    if "full_name" in data:
        data["full_name"] = data["full_name"].strip()
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user_dict(user)


@router.post("/{user_id}/reset-password")
def reset_password(user_id: str, body: PasswordReset, db: Session = Depends(get_db),
                   _: User = Depends(require_admin)):
    user = _get_user(user_id, db)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password reset"}
