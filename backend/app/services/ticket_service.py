from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, Ticket, TicketComment, TicketEvent, User

OPEN_STATUSES = ("OPEN", "IN_PROGRESS", "PENDING")


def next_ticket_code(db: Session) -> str:
    """QIT-000001, QIT-000002... based on the highest existing code (codes sort as text)."""
    last = db.scalar(select(func.max(Ticket.ticket_code)).where(Ticket.ticket_code.like("QIT-%")))
    try:
        number = int(last.split("-")[1]) + 1 if last else 1
    except (IndexError, ValueError):
        number = (db.scalar(select(func.count()).select_from(Ticket)) or 0) + 1
    return f"QIT-{number:06d}"


def _names(db: Session, user_ids: set[str]) -> dict[str, str]:
    user_ids.discard(None)
    if not user_ids:
        return {}
    rows = db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids))).all()
    return {row.id: row.full_name for row in rows}


def serialize_tickets(tickets: list[Ticket], db: Session) -> list[dict]:
    names = _names(db, {t.created_by for t in tickets} | {t.assigned_to for t in tickets})
    categories = {c.id: c.name for c in db.scalars(select(Category)).all()}
    return [
        {
            "id": t.id,
            "ticket_code": t.ticket_code,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "created_by": t.created_by,
            "creator_name": names.get(t.created_by),
            "assigned_to": t.assigned_to,
            "assignee_name": names.get(t.assigned_to),
            "category_id": t.category_id,
            "category_name": categories.get(t.category_id),
            "ai_diagnosis": t.ai_diagnosis,
            "resolution": t.resolution,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in tickets
    ]


def serialize_ticket(ticket: Ticket, db: Session) -> dict:
    return serialize_tickets([ticket], db)[0]


def serialize_comments(comments: list[TicketComment], db: Session) -> list[dict]:
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({c.user_id for c in comments}))).all()}
    return [
        {
            "id": c.id,
            "user_id": c.user_id,
            "user_name": users[c.user_id].full_name if c.user_id in users else None,
            "user_role": users[c.user_id].role if c.user_id in users else None,
            "content": c.content,
            "is_internal": c.is_internal,
            "created_at": c.created_at,
        }
        for c in comments
    ]


def add_event(db: Session, ticket: Ticket, user: User, action: str,
              old_value: str | None = None, new_value: str | None = None) -> None:
    db.add(TicketEvent(ticket_id=ticket.id, user_id=user.id, action=action,
                       old_value=old_value, new_value=new_value))


def serialize_events(events: list[TicketEvent], db: Session) -> list[dict]:
    """ASSIGNEE and CATEGORY events store ids; resolve them to names for display."""
    user_ids = {e.user_id for e in events}
    for e in events:
        if e.action == "ASSIGNEE":
            user_ids |= {e.old_value, e.new_value}
    names = _names(db, user_ids)
    categories = {c.id: c.name for c in db.scalars(select(Category)).all()}

    def label(action: str, value: str | None) -> str | None:
        if value is None:
            return None
        if action == "ASSIGNEE":
            return names.get(value, value)
        if action == "CATEGORY":
            return categories.get(value, value)
        return value

    return [
        {
            "id": e.id,
            "user_name": names.get(e.user_id),
            "action": e.action,
            "old_value": label(e.action, e.old_value),
            "new_value": label(e.action, e.new_value),
            "created_at": e.created_at,
        }
        for e in events
    ]
