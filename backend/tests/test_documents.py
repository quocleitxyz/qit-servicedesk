import os


def _doc(client, headers, title="How to connect to the office VPN"):
    response = client.post("/api/documents", headers=headers,
                           json={"title": title, "summary": "Step by step", "content": "# VPN\n1. Open the client",
                                 "topic": "Network"})
    assert response.status_code == 200, response.text
    return response.json()


def _ids(client, headers, **params):
    return {d["id"] for d in client.get("/api/documents", params=params, headers=headers).json()}


def test_user_document_needs_approval(client, user_headers, admin_headers, support_headers):
    doc = _doc(client, user_headers)
    assert doc["status"] == "PENDING"

    # Author and IT see it; it is listed as pending for IT.
    assert doc["id"] in _ids(client, user_headers)
    assert doc["id"] in _ids(client, support_headers, status="PENDING")

    # Another regular user does not.
    other = client.post("/api/users", headers=admin_headers, json={
        "full_name": "Other Reader", "email": "reader@qit.local", "password": "Reader!Pass1"})
    assert other.status_code == 200
    token = client.post("/api/auth/login", json={"email": "reader@qit.local", "password": "Reader!Pass1"}).json()
    reader = {"Authorization": f"Bearer {token['access_token']}"}
    assert doc["id"] not in _ids(client, reader)
    assert client.get(f"/api/documents/{doc['id']}", headers=reader).status_code == 404

    # Only IT can review.
    review = {"action": "APPROVE"}
    assert client.post(f"/api/documents/{doc['id']}/review", json=review, headers=user_headers).status_code == 403
    approved = client.post(f"/api/documents/{doc['id']}/review", json=review, headers=support_headers)
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["reviewer_name"] == "IT Support"
    assert doc["id"] in _ids(client, reader)
    assert client.get(f"/api/documents/{doc['id']}", headers=reader).json()["content"].startswith("# VPN")

    # Readers cannot edit or delete someone else's document.
    assert client.patch(f"/api/documents/{doc['id']}", json={"title": "Hacked title"}, headers=reader).status_code == 403
    assert client.delete(f"/api/documents/{doc['id']}", headers=reader).status_code == 403

    # An edit by the author sends it back for approval.
    edited = client.patch(f"/api/documents/{doc['id']}", json={"content": "Updated"}, headers=user_headers)
    assert edited.json()["status"] == "PENDING"
    assert doc["id"] not in _ids(client, reader)


def test_staff_document_is_published_immediately(client, support_headers, user_headers):
    doc = _doc(client, support_headers, title="Printer driver installation")
    assert doc["status"] == "APPROVED"
    assert doc["id"] in _ids(client, user_headers, q="printer DRIVER")
    edited = client.patch(f"/api/documents/{doc['id']}", json={"summary": "New summary"}, headers=support_headers)
    assert edited.json()["status"] == "APPROVED"


def test_reject_requires_note(client, user_headers, admin_headers):
    doc = _doc(client, user_headers, title="Draft that will be rejected")
    url = f"/api/documents/{doc['id']}/review"
    assert client.post(url, json={"action": "REJECT"}, headers=admin_headers).status_code == 400
    rejected = client.post(url, json={"action": "REJECT", "note": "Please add screenshots"}, headers=admin_headers)
    assert rejected.json()["status"] == "REJECTED"
    assert client.get(f"/api/documents/{doc['id']}", headers=user_headers).json()["review_note"] == "Please add screenshots"


def test_upload_download_delete_file(client, support_headers, user_headers):
    doc = _doc(client, support_headers, title="Guide with attachment")
    url = f"/api/documents/{doc['id']}/files"
    payload = b"%PDF-1.4 fake pdf content"

    uploaded = client.post(url, headers=support_headers,
                           files={"file": ("../../Hướng dẫn VPN.pdf", payload, "application/pdf")})
    assert uploaded.status_code == 200, uploaded.text
    info = uploaded.json()
    assert info["name"] == "Hướng dẫn VPN.pdf" and info["size"] == len(payload)

    stored = os.listdir(os.path.join(os.environ["UPLOAD_DIR"], doc["id"]))
    assert len(stored) == 1 and stored[0].endswith(".pdf")

    # Any signed-in user can download from an approved document, but not without a token.
    download = client.get(f"{url}/{info['id']}", headers=user_headers)
    assert download.status_code == 200 and download.content == payload
    assert "attachment" in download.headers["content-disposition"]
    assert client.get(f"{url}/{info['id']}").status_code == 401

    detail = client.get(f"/api/documents/{doc['id']}", headers=user_headers).json()
    assert [f["name"] for f in detail["files"]] == ["Hướng dẫn VPN.pdf"]

    # A reader cannot attach files to or remove files from someone else's document.
    assert client.post(url, headers=user_headers, files={"file": ("x.txt", b"x", "text/plain")}).status_code == 403
    assert client.delete(f"{url}/{info['id']}", headers=user_headers).status_code == 403

    assert client.delete(f"{url}/{info['id']}", headers=support_headers).status_code == 200
    assert os.listdir(os.path.join(os.environ["UPLOAD_DIR"], doc["id"])) == []
    assert client.get(f"{url}/{info['id']}", headers=user_headers).status_code == 404


def test_upload_limits(client, support_headers):
    doc = _doc(client, support_headers, title="Guide for upload limits")
    url = f"/api/documents/{doc['id']}/files"
    too_big = b"0" * (1024 * 1024 + 1)   # MAX_UPLOAD_MB=1 in tests
    assert client.post(url, headers=support_headers,
                       files={"file": ("big.zip", too_big, "application/zip")}).status_code == 413
    assert client.post(url, headers=support_headers,
                       files={"file": ("setup.EXE", b"MZ", "application/octet-stream")}).status_code == 400
    assert client.post(url, headers=support_headers,
                       files={"file": ("empty.txt", b"", "text/plain")}).status_code == 400
    assert os.listdir(os.path.join(os.environ["UPLOAD_DIR"], doc["id"])) == []


def test_delete_document_removes_files(client, user_headers):
    doc = _doc(client, user_headers, title="Document to delete")
    client.post(f"/api/documents/{doc['id']}/files", headers=user_headers,
                files={"file": ("notes.txt", b"hello", "text/plain")})
    folder = os.path.join(os.environ["UPLOAD_DIR"], doc["id"])
    assert os.path.isdir(folder)
    assert client.delete(f"/api/documents/{doc['id']}", headers=user_headers).status_code == 200
    assert not os.path.exists(folder)
    assert client.get(f"/api/documents/{doc['id']}", headers=user_headers).status_code == 404


def test_stats(client, user_headers, support_headers):
    stats = client.get("/api/documents/stats", headers=support_headers).json()
    assert stats["max_upload_mb"] == 1
    assert stats["approved"] >= 1
