from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import AIMessage, User
from app.schemas import AIChatRequest
from app.services import ai_assistant

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/chat")
def chat(body: AIChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    answer = ai_assistant.generate_answer(body.message, body.lang)
    db.add(AIMessage(user_id=user.id, role="USER", content=body.message))
    db.add(AIMessage(user_id=user.id, role="ASSISTANT", content=answer))
    db.commit()
    return {"answer": answer, "mode": ai_assistant.MODE}
