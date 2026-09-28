def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_content_type_is_json(client):
    response = client.get("/health")

    assert response.headers["content-type"].startswith("application/json")


def test_unknown_route_returns_404(client):
    response = client.get("/does-not-exist")

    assert response.status_code == 404
