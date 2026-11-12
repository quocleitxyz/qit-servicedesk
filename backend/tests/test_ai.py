def test_ai_network_answer(client, user_headers):
    response = client.post("/api/ai/chat", json={"message": "Wifi không vào được"}, headers=user_headers)
    assert response.status_code == 200
    assert "ipconfig" in response.json()["answer"]


def test_ai_chat_english(client, user_headers):
    response = client.post("/api/ai/chat", json={"message": "printer is offline", "lang": "en"}, headers=user_headers)
    assert response.status_code == 200
    assert "print queue" in response.json()["answer"]
