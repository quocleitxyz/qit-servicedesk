def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "environment" in body


def test_ready(client):
    response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
