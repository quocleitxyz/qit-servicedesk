from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import STAFF_ROLES, get_current_user
from app.core.database import get_db
from app.models import Category, Ticket, TicketComment, TicketEvent, User
from app.schemas import CommentCreate, Priority, Status, TicketCreate, TicketUpdate
from app.services.ticket_service import (
    OPEN_STATUSES, add_event, next_ticket_code, serialize_comments, serialize_events,
    serialize_ticket, serialize_tickets,
)

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES


def _get_visible_ticket(ticket_id: str, db: Session, user: User) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket_not_found")
    if not _is_staff(user) and ticket.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not_allowed")
    return ticket


def _scope(stmt, user: User):
    """Regular users only ever see their own tickets."""
    return stmt if _is_staff(user) else stmt.where(Ticket.created_by == user.id)


@router.get("")
def list_tickets(
    status_filter: Status | None = Query(default=None, alias="status"),
    priority: Priority | None = None,
    category_id: str | None = None,
    assigned: str | None = Query(default=None, description="me | unassigned | <user id>"),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = _scope(select(Ticket), user)
    if status_filter:
        stmt = stmt.where(Ticket.status == status_filter)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if category_id:
        stmt = stmt.where(Ticket.category_id == category_id)
    if assigned == "me":
        stmt = stmt.where(Ticket.assigned_to == user.id)
    elif assigned == "unassigned":
        stmt = stmt.where(Ticket.assigned_to.is_(None))
    elif assigned:
        stmt = stmt.where(Ticket.assigned_to == assigned)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Ticket.title).like(like),
                              func.lower(Ticket.ticket_code).like(like),
                              func.lower(Ticket.description).like(like)))
    tickets = db.scalars(stmt.order_by(Ticket.created_at.desc()).limit(limit)).all()
    return serialize_tickets(list(tickets), db)


@router.get("/stats")
def ticket_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    def grouped(column):
        stmt = _scope(select(column, func.count()).group_by(column), user)
        return {key: count for key, count in db.execute(stmt).all()}

    by_status = grouped(Ticket.status)
    open_stmt = _scope(select(func.count()).select_from(Ticket).where(Ticket.status.in_(OPEN_STATUSES)), user)
    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "by_priority": grouped(Ticket.priority),
        "unassigned": db.scalar(open_stmt.where(Ticket.assigned_to.is_(None))) or 0,
        "assigned_to_me": db.scalar(open_stmt.where(Ticket.assigned_to == user.id)) or 0,
    }


@router.post("", status_code=status.HTTP_200_OK)
def create_ticket(body: TicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if body.category_id and not db.get(Category, body.category_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "category_not_found")
    ticket = Ticket(
        ticket_code=next_ticket_code(db),
        title=body.title.strip(),
        description=body.description.strip(),
        priority=body.priority,
        category_id=body.category_id,
        created_by=user.id,
    )
    db.add(ticket)
    db.flush()
    add_event(db, ticket, user, "CREATED")
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket, db)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = _get_visible_ticket(ticket_id, db, user)
    comments = db.scalars(
        select(TicketComment).where(TicketComment.ticket_id == ticket_id).order_by(TicketComment.created_at)
    ).all()
    visible = [c for c in comments if not c.is_internal or _is_staff(user)]
    events = db.scalars(
        select(TicketEvent).where(TicketEvent.ticket_id == ticket_id).order_by(TicketEvent.created_at)
    ).all()
    return {
        **serialize_ticket(ticket, db),
        "comments": serialize_comments(visible, db),
        "events": serialize_events(list(events), db),
    }


@router.post("/{ticket_id}/comments")
def add_comment(ticket_id: str, body: CommentCreate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    ticket = _get_visible_ticket(ticket_id, db, user)
    # Internal notes are for IT only; the flag is ignored for regular users.
    internal = body.is_internal and _is_staff(user)
    comment = TicketComment(ticket_id=ticket_id, user_id=user.id, content=body.content.strip(), is_internal=internal)
    db.add(comment)
    # A reply from the requester on a ticket waiting for them puts it back in the IT queue.
    if not _is_staff(user) and ticket.status == "PENDING":
        add_event(db, ticket, user, "STATUS", ticket.status, "IN_PROGRESS")
        ticket.status = "IN_PROGRESS"
    db.commit()
    return {"message": "Comment added", "id": comment.id}


# What the requester may do to their own ticket: close it, or reopen it after it was resolved/closed.
_OWNER_TRANSITIONS = {("RESOLVED", "CLOSED"), ("OPEN", "CLOSED"), ("RESOLVED", "OPEN"), ("CLOSED", "OPEN")}

_TRACKED = {"status": "STATUS", "priority": "PRIORITY", "assigned_to": "ASSIGNEE",
            "category_id": "CATEGORY", "resolution": "RESOLUTION"}


@router.patch("/{ticket_id}")
def update_ticket(ticket_id: str, body: TicketUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    ticket = _get_visible_ticket(ticket_id, db, user)
    data = body.model_dump(exclude_unset=True)

    if not _is_staff(user):
        if set(data) != {"status"} or (ticket.status, data["status"]) not in _OWNER_TRANSITIONS:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "staff_required")

    if data.get("status") is None:
        data.pop("status", None)
    if data.get("priority") is None:
        data.pop("priority", None)
    if data.get("assigned_to"):
        assignee = db.get(User, data["assigned_to"])
        if not assignee or not assignee.is_active or assignee.role not in STAFF_ROLES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "assignee_not_found")
    if data.get("category_id") and not db.get(Category, data["category_id"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "category_not_found")

    for key, value in data.items():
        value = value or None if key in ("assigned_to", "category_id", "resolution") else value
        old = getattr(ticket, key)
        if old == value:
            continue
        add_event(db, ticket, user, _TRACKED[key], old, value)
        setattr(ticket, key, value)

    # Picking up an untouched ticket moves it to "in progress" automatically.
    if "assigned_to" in data and ticket.assigned_to and ticket.status == "OPEN" and "status" not in data:
        add_event(db, ticket, user, "STATUS", "OPEN", "IN_PROGRESS")
        ticket.status = "IN_PROGRESS"

    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket, db)
