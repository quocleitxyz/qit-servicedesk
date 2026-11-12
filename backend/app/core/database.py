from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def get_database_url() -> URL:
    """Use DATABASE_URL when set, otherwise build the URL from the DB_* variables."""
    if settings.database_url:
        return make_url(settings.database_url)

    required = {
        "DB_HOST": settings.db_host,
        "DB_NAME": settings.db_name,
        "DB_USER": settings.db_user,
        "DB_PASSWORD": settings.db_password,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing database environment variables: {', '.join(missing)}")

    return URL.create(
        drivername="postgresql+psycopg",
        username=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
    )


DATABASE_URL = get_database_url()

_connect_args: dict = {}
if DATABASE_URL.get_backend_name() == "postgresql":
    _connect_args["connect_timeout"] = settings.db_connect_timeout
elif DATABASE_URL.get_backend_name() == "sqlite":
    _connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
