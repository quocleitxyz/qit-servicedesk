import os
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    app_name: str = "QIT"
    app_version: str = field(default_factory=lambda: os.getenv("APP_VERSION", "dev"))
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "local"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    # Database
    database_url: str | None = field(default_factory=lambda: os.getenv("DATABASE_URL"))
    db_host: str | None = field(default_factory=lambda: os.getenv("DB_HOST"))
    db_port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str | None = field(default_factory=lambda: os.getenv("DB_NAME"))
    db_user: str | None = field(default_factory=lambda: os.getenv("DB_USER"))
    db_password: str | None = field(default_factory=lambda: os.getenv("DB_PASSWORD"))
    db_connect_timeout: int = field(default_factory=lambda: int(os.getenv("DB_CONNECT_TIMEOUT", "5")))
    db_startup_retries: int = field(default_factory=lambda: int(os.getenv("DB_STARTUP_RETRIES", "10")))
    db_startup_delay: int = field(default_factory=lambda: int(os.getenv("DB_STARTUP_DELAY", "3")))

    # Auth
    jwt_secret: str | None = field(default_factory=lambda: os.getenv("JWT_SECRET"))
    jwt_expire_minutes: int = field(default_factory=lambda: int(os.getenv("JWT_EXPIRE_MINUTES", "480")))

    # File storage (knowledge base attachments). On K8s this path is a Longhorn volume.
    upload_dir: str = field(default_factory=lambda: os.getenv("UPLOAD_DIR", "/data/uploads"))
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv("MAX_UPLOAD_MB", "50")))

    # First administrator, created at startup when no account with this email exists.
    # Needed on environments without demo users (staging, prod), otherwise nobody could sign in.
    admin_email: str | None = field(default_factory=lambda: os.getenv("ADMIN_EMAIL"))
    admin_password: str | None = field(default_factory=lambda: os.getenv("ADMIN_PASSWORD"))
    admin_name: str = field(default_factory=lambda: os.getenv("ADMIN_NAME", "QIT Administrator"))

    # Seeding
    seed_demo_users: bool = field(default_factory=lambda: _env_bool("SEED_DEMO_USERS", False))


settings = Settings()
