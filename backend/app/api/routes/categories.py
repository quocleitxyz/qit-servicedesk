from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Category

router = APIRouter(prefix="/categories", tags=["categories"], dependencies=[Depends(get_current_user)])


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    categories = db.scalars(select(Category).order_by(Category.name)).all()
    return [{"id": c.id, "name": c.name, "description": c.description} for c in categories]
