def test_login_success(client):
    response = client.post("/api/auth/login", json={"email": "admin@qit.local", "password": "QitAdmin!2026"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "IT_ADMIN"


def test_login_wrong_password(client):
    response = client.post("/api/auth/login", json={"email": "admin@qit.local", "password": "wrong"})
    assert response.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me(client, user_headers):
    response = client.get("/api/auth/me", headers=user_headers)
    assert response.status_code == 200
    assert response.json()["email"] == "user@qit.local"


def test_first_admin_created_from_environment(client):
    response = client.post("/api/auth/login", json={"email": "first.admin@qit.local", "password": "FirstAdmin!2026"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "IT_ADMIN"
