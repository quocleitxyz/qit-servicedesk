import os
import tempfile

import pytest

_db_file = os.path.join(tempfile.mkdtemp(), "qit-test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db_file}")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("SEED_DEMO_USERS", "true")
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp())
os.environ.setdefault("MAX_UPLOAD_MB", "1")
os.environ.setdefault("ADMIN_EMAIL", "First.Admin@QIT.local")
os.environ.setdefault("ADMIN_PASSWORD", "FirstAdmin!2026")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _login(client, email, password):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, "admin@qit.local", "QitAdmin!2026")


@pytest.fixture(scope="session")
def user_headers(client):
    return _login(client, "user@qit.local", "QitUser!2026")


@pytest.fixture(scope="session")
def support_headers(client):
    return _login(client, "support@qit.local", "QitSupport!2026")
