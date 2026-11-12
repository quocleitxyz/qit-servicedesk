from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, get_current_user, require_staff
from app.core.config import settings
from app.core.database import get_db
from app.models import Document, DocumentFile, User
from app.models.base import now_utc
from app.schemas import DocumentCreate, DocumentReview, DocumentUpdate
from app.services import storage

router = APIRouter(prefix="/documents", tags=["documents"])

def _is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES


def _visible(stmt, user: User):
    """Everyone sees approved documents; authors also see their own; IT sees everything."""
    if _is_staff(user):
        return stmt
    return stmt.where(or_(Document.status == "APPROVED", Document.created_by == user.id))


def _get_document(document_id: str, db: Session, user: User) -> Document:
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document_not_found")
    if not _is_staff(user) and document.status != "APPROVED" and document.created_by != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document_not_found")
    return document


def _get_editable(document_id: str, db: Session, user: User) -> Document:
    document = _get_document(document_id, db, user)
    if not _is_staff(user) and document.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not_allowed")
    return document


def _after_author_change(document: Document, user: User) -> None:
    """Any change made by a non-IT author must be approved again before it is public."""
    if not _is_staff(user):
        document.status = "PENDING"
        document.review_note = None
        document.reviewed_by = None
        document.reviewed_at = None


def _file_dict(f: DocumentFile) -> dict:
    return {"id": f.id, "name": f.original_name, "size": f.size,
            "content_type": f.content_type, "created_at": f.created_at}


def _serialize(documents: list[Document], db: Session, with_content: bool = False) -> list[dict]:
    ids = [d.id for d in documents]
    user_ids = {d.created_by for d in documents} | {d.reviewed_by for d in documents if d.reviewed_by}
    names = {}
    if user_ids:
        names = {r.id: r.full_name for r in db.execute(
            select(User.id, User.full_name).where(User.id.in_(user_ids))).all()}
    files: dict[str, list[DocumentFile]] = {}
    if ids:
        for f in db.scalars(select(DocumentFile).where(DocumentFile.document_id.in_(ids))
                            .order_by(DocumentFile.created_at)).all():
            files.setdefault(f.document_id, []).append(f)
    result = []
    for d in documents:
        item = {
            "id": d.id,
            "title": d.title,
            "summary": d.summary,
            "topic": d.topic,
            "status": d.status,
            "review_note": d.review_note,
            "created_by": d.created_by,
            "author_name": names.get(d.created_by),
            "reviewer_name": names.get(d.reviewed_by),
            "reviewed_at": d.reviewed_at,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
            "file_count": len(files.get(d.id, [])),
        }
        if with_content:
            item["content"] = d.content
            item["files"] = [_file_dict(f) for f in files.get(d.id, [])]
        result.append(item)
    return result


@router.get("")
def list_documents(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(PENDING|APPROVED|REJECTED)$"),
    topic: str | None = Query(default=None, max_length=50),
    mine: bool = False,
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = _visible(select(Document), user)
    if status_filter:
        stmt = stmt.where(Document.status == status_filter)
    if topic:
        stmt = stmt.where(Document.topic == topic)
    if mine:
        stmt = stmt.where(Document.created_by == user.id)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Document.title).like(like),
                              func.lower(func.coalesce(Document.summary, "")).like(like),
                              func.lower(Document.content).like(like)))
    documents = db.scalars(stmt.order_by(Document.updated_at.desc()).limit(500)).all()
    return _serialize(list(documents), db)


@router.get("/stats")
def document_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    def count(*conditions) -> int:
        return db.scalar(select(func.count()).select_from(Document).where(*conditions)) or 0

    pending = (Document.status == "PENDING",)
    if not _is_staff(user):
        pending += (Document.created_by == user.id,)
    return {
        "approved": count(Document.status == "APPROVED"),
        "pending": count(*pending),
        "mine": count(Document.created_by == user.id),
        "max_upload_mb": settings.max_upload_mb,
    }


@router.post("")
def create_document(body: DocumentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = Document(
        title=body.title.strip(),
        summary=(body.summary or "").strip() or None,
        content=body.content,
        topic=body.topic.strip(),
        created_by=user.id,
    )
    # Documents written by IT are published immediately; everyone else waits for approval.
    if _is_staff(user):
        document.status = "APPROVED"
        document.reviewed_by = user.id
        document.reviewed_at = now_utc()
    db.add(document)
    db.commit()
    db.refresh(document)
    return _serialize([document], db, with_content=True)[0]


@router.get("/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _serialize([_get_document(document_id, db, user)], db, with_content=True)[0]


@router.patch("/{document_id}")
def update_document(document_id: str, body: DocumentUpdate, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    document = _get_editable(document_id, db, user)
    data = body.model_dump(exclude_unset=True)
    for key in ("title", "topic", "content"):
        if key in data and data[key] is None:
            data.pop(key)
    for key, value in data.items():
        if key in ("title", "topic"):
            value = value.strip()
        elif key == "summary":
            value = (value or "").strip() or None
        setattr(document, key, value)
    if data:
        _after_author_change(document, user)
    db.commit()
    db.refresh(document)
    return _serialize([document], db, with_content=True)[0]


@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = _get_editable(document_id, db, user)
    for f in db.scalars(select(DocumentFile).where(DocumentFile.document_id == document.id)).all():
        db.delete(f)
    db.delete(document)
    db.commit()
    storage.delete_document_folder(document_id)
    return {"message": "Document deleted"}


@router.post("/{document_id}/review")
def review_document(document_id: str, body: DocumentReview, db: Session = Depends(get_db),
                    user: User = Depends(require_staff)):
    document = _get_document(document_id, db, user)
    if body.action == "REJECT" and not (body.note or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "review_note_required")
    document.status = "APPROVED" if body.action == "APPROVE" else "REJECTED"
    document.review_note = (body.note or "").strip() or None
    document.reviewed_by = user.id
    document.reviewed_at = now_utc()
    db.commit()
    db.refresh(document)
    return _serialize([document], db, with_content=True)[0]


@router.post("/{document_id}/files")
def upload_file(document_id: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    document = _get_editable(document_id, db, user)
    original, stored, size = storage.save_upload(document.id, file)
    record = DocumentFile(document_id=document.id, original_name=original, stored_name=stored,
                          size=size, content_type=file.content_type, uploaded_by=user.id)
    db.add(record)
    _after_author_change(document, user)
    document.updated_at = now_utc()
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_file(document.id, stored)
        raise
    db.refresh(record)
    return _file_dict(record)


def _get_file(document: Document, file_id: str, db: Session) -> DocumentFile:
    record = db.get(DocumentFile, file_id)
    if not record or record.document_id != document.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file_not_found")
    return record


@router.get("/{document_id}/files/{file_id}")
def download_file(document_id: str, file_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    document = _get_document(document_id, db, user)
    record = _get_file(document, file_id, db)
    path = storage.file_path(document.id, record.stored_name)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file_missing_on_storage")
    # Always a download, never rendered inline by the browser.
    return FileResponse(path, filename=record.original_name, media_type="application/octet-stream",
                        headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/{document_id}/files/{file_id}")
def delete_file(document_id: str, file_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    document = _get_editable(document_id, db, user)
    record = _get_file(document, file_id, db)
    stored = record.stored_name
    db.delete(record)
    _after_author_change(document, user)
    db.commit()
    storage.delete_file(document.id, stored)
    return {"message": "File deleted"}
