def test_categories_seeded(client, user_headers):
    response = client.get("/api/categories", headers=user_headers)
    assert response.status_code == 200
    assert {c["name"] for c in response.json()} >= {"Network", "Hardware", "Other"}


def test_ticket_lifecycle(client, user_headers, admin_headers):
    created = client.post(
        "/api/tickets",
        json={"title": "Cannot connect", "description": "Wi-Fi drops every 5 minutes", "priority": "HIGH"},
        headers=user_headers,
    )
    assert created.status_code == 200, created.text
    ticket = created.json()
    assert ticket["ticket_code"].startswith("QIT-")
    assert ticket["status"] == "OPEN"

    comment = client.post(f"/api/tickets/{ticket['id']}/comments",
                          json={"content": "Still happening"}, headers=user_headers)
    assert comment.status_code == 200

    # Regular users cannot update tickets.
    forbidden = client.patch(f"/api/tickets/{ticket['id']}", json={"status": "RESOLVED"}, headers=user_headers)
    assert forbidden.status_code == 403

    updated = client.patch(f"/api/tickets/{ticket['id']}",
                           json={"status": "RESOLVED", "resolution": "Router replaced"}, headers=admin_headers)
    assert updated.status_code == 200
    assert updated.json()["status"] == "RESOLVED"

    detail = client.get(f"/api/tickets/{ticket['id']}", headers=user_headers).json()
    assert len(detail["comments"]) == 1


def test_invalid_priority_rejected(client, user_headers):
    response = client.post(
        "/api/tickets",
        json={"title": "Printer", "description": "Paper jam again", "priority": "URGENT"},
        headers=user_headers,
    )
    assert response.status_code == 422


def _new_ticket(client, headers, title="Laptop will not boot", priority="MEDIUM"):
    response = client.post("/api/tickets", headers=headers,
                           json={"title": title, "description": "Black screen after update", "priority": priority})
    assert response.status_code == 200, response.text
    return response.json()


def test_assign_moves_ticket_to_in_progress_and_records_history(client, user_headers, admin_headers, support_headers):
    ticket = _new_ticket(client, user_headers)
    staff = client.get("/api/users/staff", headers=admin_headers).json()
    support = next(s for s in staff if s["role"] == "IT_SUPPORT")

    updated = client.patch(f"/api/tickets/{ticket['id']}", json={"assigned_to": support["id"]}, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["assignee_name"] == "IT Support"
    assert updated.json()["status"] == "IN_PROGRESS"

    detail = client.get(f"/api/tickets/{ticket['id']}", headers=support_headers).json()
    actions = [e["action"] for e in detail["events"]]
    assert actions == ["CREATED", "ASSIGNEE", "STATUS"]
    assert detail["events"][1]["new_value"] == "IT Support"

    mine = client.get("/api/tickets", params={"assigned": "me"}, headers=support_headers).json()
    assert ticket["id"] in {t["id"] for t in mine}


def test_cannot_assign_to_regular_user(client, user_headers, admin_headers):
    ticket = _new_ticket(client, user_headers)
    me = client.get("/api/auth/me", headers=user_headers).json()
    response = client.patch(f"/api/tickets/{ticket['id']}", json={"assigned_to": me["id"]}, headers=admin_headers)
    assert response.status_code == 400


def test_internal_notes_hidden_from_requester(client, user_headers, support_headers):
    ticket = _new_ticket(client, user_headers)
    url = f"/api/tickets/{ticket['id']}/comments"
    assert client.post(url, json={"content": "Needs a new SSD", "is_internal": True},
                       headers=support_headers).status_code == 200
    # A regular user cannot create internal notes: the flag is ignored.
    assert client.post(url, json={"content": "Any news?", "is_internal": True},
                       headers=user_headers).status_code == 200

    as_user = client.get(f"/api/tickets/{ticket['id']}", headers=user_headers).json()["comments"]
    as_staff = client.get(f"/api/tickets/{ticket['id']}", headers=support_headers).json()["comments"]
    assert [c["content"] for c in as_user] == ["Any news?"]
    assert [c["is_internal"] for c in as_staff] == [True, False]


def test_requester_can_close_and_reopen_only(client, user_headers, admin_headers):
    ticket = _new_ticket(client, user_headers)
    url = f"/api/tickets/{ticket['id']}"
    assert client.patch(url, json={"priority": "CRITICAL"}, headers=user_headers).status_code == 403
    assert client.patch(url, json={"status": "IN_PROGRESS"}, headers=user_headers).status_code == 403
    client.patch(url, json={"status": "RESOLVED", "resolution": "Reinstalled"}, headers=admin_headers)
    assert client.patch(url, json={"status": "CLOSED"}, headers=user_headers).json()["status"] == "CLOSED"
    assert client.patch(url, json={"status": "OPEN"}, headers=user_headers).json()["status"] == "OPEN"


def test_requester_reply_reopens_pending_ticket(client, user_headers, admin_headers):
    ticket = _new_ticket(client, user_headers)
    url = f"/api/tickets/{ticket['id']}"
    client.patch(url, json={"status": "PENDING"}, headers=admin_headers)
    client.post(f"{url}/comments", json={"content": "Here is the serial number"}, headers=user_headers)
    assert client.get(url, headers=user_headers).json()["status"] == "IN_PROGRESS"


def test_filters_search_and_stats(client, user_headers, admin_headers):
    ticket = _new_ticket(client, user_headers, title="Projector zebra stripes", priority="CRITICAL")
    found = client.get("/api/tickets", params={"q": "ZEBRA", "priority": "CRITICAL"}, headers=admin_headers).json()
    assert [t["id"] for t in found] == [ticket["id"]]
    assert client.get("/api/tickets", params={"q": "zebra", "status": "CLOSED"}, headers=admin_headers).json() == []

    stats = client.get("/api/tickets/stats", headers=admin_headers).json()
    assert stats["total"] == sum(stats["by_status"].values())
    assert stats["by_priority"]["CRITICAL"] >= 1
    assert stats["unassigned"] >= 1


def test_user_cannot_see_other_users_ticket(client, admin_headers, user_headers):
    ticket = _new_ticket(client, admin_headers)
    assert client.get(f"/api/tickets/{ticket['id']}", headers=user_headers).status_code == 403
    assert ticket["id"] not in {t["id"] for t in client.get("/api/tickets", headers=user_headers).json()}
