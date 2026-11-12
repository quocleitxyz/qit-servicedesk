def _create(client, admin_headers, email, role="USER"):
    return client.post("/api/users", headers=admin_headers,
                       json={"full_name": "Test Person", "email": email, "password": "Passw0rd!x", "role": role})


def test_only_admin_manages_users(client, user_headers, support_headers):
    assert client.get("/api/users", headers=user_headers).status_code == 403
    assert client.get("/api/users", headers=support_headers).status_code == 403
    assert client.get("/api/users/staff", headers=user_headers).status_code == 403
    assert client.get("/api/users/staff", headers=support_headers).status_code == 200


def test_create_login_disable(client, admin_headers):
    created = _create(client, admin_headers, "New.Person@QIT.local")
    assert created.status_code == 200, created.text
    user = created.json()
    assert user["email"] == "new.person@qit.local"
    assert _create(client, admin_headers, "new.person@qit.local").status_code == 409

    login = {"email": "new.person@qit.local", "password": "Passw0rd!x"}
    assert client.post("/api/auth/login", json=login).status_code == 200

    updated = client.patch(f"/api/users/{user['id']}", json={"role": "IT_SUPPORT", "is_active": False},
                           headers=admin_headers)
    assert updated.json()["role"] == "IT_SUPPORT" and updated.json()["is_active"] is False
    assert client.post("/api/auth/login", json=login).status_code == 401


def test_validation(client, admin_headers):
    assert _create(client, admin_headers, "not-an-email").status_code == 422
    short = client.post("/api/users", headers=admin_headers,
                        json={"full_name": "Short Pass", "email": "short@qit.local", "password": "123"})
    assert short.status_code == 422


def test_admin_cannot_lock_self_out(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    assert client.patch(f"/api/users/{me['id']}", json={"is_active": False}, headers=admin_headers).status_code == 400
    assert client.patch(f"/api/users/{me['id']}", json={"role": "USER"}, headers=admin_headers).status_code == 400
    assert client.patch(f"/api/users/{me['id']}", json={"full_name": "QIT Administrator"},
                        headers=admin_headers).status_code == 200


def test_reset_and_change_password(client, admin_headers):
    user = _create(client, admin_headers, "pw.user@qit.local").json()
    assert client.post(f"/api/users/{user['id']}/reset-password", json={"new_password": "ResetPass!1"},
                       headers=admin_headers).status_code == 200
    token = client.post("/api/auth/login", json={"email": "pw.user@qit.local", "password": "ResetPass!1"}).json()
    headers = {"Authorization": f"Bearer {token['access_token']}"}

    wrong = client.post("/api/auth/change-password", headers=headers,
                        json={"current_password": "nope", "new_password": "Another!Pass2"})
    assert wrong.status_code == 400
    ok = client.post("/api/auth/change-password", headers=headers,
                     json={"current_password": "ResetPass!1", "new_password": "Another!Pass2"})
    assert ok.status_code == 200
    assert client.post("/api/auth/login",
                       json={"email": "pw.user@qit.local", "password": "Another!Pass2"}).status_code == 200
