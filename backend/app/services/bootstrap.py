import logging
import time

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Category, User
from app.services import storage

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES = [
    ("Network", "LAN, Wi-Fi, Internet, VPN"),
    ("Hardware", "PC, laptop, printer"),
    ("Software", "Windows, Office, applications"),
    ("Account", "Account and authentication"),
    ("Email", "Outlook and mail"),
    ("Server", "Server and infrastructure"),
    ("Other", "Other IT incidents"),
]

DEMO_USERS = [
    ("QIT Administrator", "admin@qit.local", "QitAdmin!2026", "IT_ADMIN"),
    ("IT Support", "support@qit.local", "QitSupport!2026", "IT_SUPPORT"),
    ("Demo User", "user@qit.local", "QitUser!2026", "USER"),
]


def wait_for_database() -> None:
    url = engine.url
    logger.info("Connecting to database %s:%s/%s as %s", url.host, url.port, url.database, url.username)
    for attempt in range(1, settings.db_startup_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection established")
            return
        except OperationalError as exc:
            reason = str(exc.orig).splitlines()[0] if exc.orig else str(exc)
            if "password authentication failed" in reason or "does not exist" in reason:
                logger.error(
                    "Database rejected the credentials: %s. Check DB_NAME/DB_USER/DB_PASSWORD. "
                    "With docker compose, an existing volume keeps the original credentials: "
                    "run 'docker compose down -v' to recreate it.", reason)
                raise
            logger.warning("Database not reachable (attempt %d/%d): %s",
                           attempt, settings.db_startup_retries, reason)
            if attempt == settings.db_startup_retries:
                raise
            time.sleep(settings.db_startup_delay)


def seed_data() -> None:
    db = SessionLocal()
    try:
        if settings.seed_demo_users:
            for full_name, email, password, role in DEMO_USERS:
                if not db.scalar(select(User).where(User.email == email)):
                    db.add(User(full_name=full_name, email=email,
                                password_hash=hash_password(password), role=role))
        if settings.admin_email and settings.admin_password:
            email = settings.admin_email.strip().lower()
            # Only created once: an existing account (and its password) is never touched.
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(full_name=settings.admin_name, email=email,
                            password_hash=hash_password(settings.admin_password), role="IT_ADMIN"))
                logger.info("Created first administrator %s", email)
        for name, description in DEFAULT_CATEGORIES:
            if not db.scalar(select(Category).where(Category.name == name)):
                db.add(Category(name=name, description=description))
        db.commit()
    except IntegrityError:
        # Another replica seeded at the same time.
        db.rollback()
    finally:
        db.close()


def init_application() -> None:
    wait_for_database()
    # create_all only adds missing tables; existing tables and their data are left untouched.
    Base.metadata.create_all(bind=engine)
    seed_data()
    if storage.check_storage():
        logger.info("Upload directory ready: %s (max %d MB per file)", storage.root(), settings.max_upload_mb)
