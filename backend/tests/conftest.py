import pytest
from fastapi.testclient import TestClient

from cortex.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("CORTEX_DATA_DIR", str(tmp_path))
    application = create_app()
    with TestClient(application):  # run lifespan → migrations
        yield application


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def admin(app):
    """A separate client logged in as the seeded admin."""
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": "admin"})
    assert r.status_code == 200
    return c


def make_user(admin, username, **kwargs):
    r = admin.post("/api/users", json={"username": username, **kwargs})
    assert r.status_code == 200, r.text
    return r.json()


def login(client, username):
    r = client.post("/api/auth/login", json={"username": username})
    assert r.status_code == 200, r.text
    return r.json()
