from fastapi.testclient import TestClient

from conftest import make_user


def test_unauthenticated(client):
    assert client.get("/api/auth/me").status_code == 401


def test_unknown_username(client):
    assert client.post("/api/auth/login", json={"username": "ghost"}).status_code == 401


def test_login_and_me(admin):
    r = admin.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    assert r.json()["is_admin"] is True


def test_logout(admin):
    admin.post("/api/auth/logout")
    assert admin.get("/api/auth/me").status_code == 401


def test_admin_creates_user_who_can_login(admin, client):
    make_user(admin, "bob")
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"username": "bob"})
    assert r.status_code == 200
    assert r.json()["is_admin"] is False


def test_duplicate_username_rejected(admin):
    make_user(admin, "bob")
    assert admin.post("/api/users", json={"username": "BOB"}).status_code == 409


def test_non_admin_cannot_manage_users(admin, client):
    make_user(admin, "bob")
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "bob"})
    assert client.post("/api/users", json={"username": "eve"}).status_code == 403
    assert client.patch("/api/users/1", json={"is_admin": False}).status_code == 403
    # but any user can list users (assignee pickers)
    assert client.get("/api/users").status_code == 200


def test_deactivated_user_locked_out(admin, client):
    bob = make_user(admin, "bob")
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "bob"})
    admin.patch(f"/api/users/{bob['id']}", json={"is_active": False})
    assert client.get("/api/auth/me").status_code == 401  # session revoked
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": "bob"}).status_code == 401


def test_api_key_flow(admin):
    r = admin.post("/api/me/api-keys", json={"name": "agent"})
    assert r.status_code == 200
    created = r.json()
    key = created["key"]
    assert key.startswith("ck_")

    bare = TestClient(admin.app)  # no cookies
    assert bare.get("/api/auth/me").status_code == 401
    r = bare.get("/api/auth/me", headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 200
    assert r.json()["username"] == "admin"

    assert bare.get("/api/auth/me", headers={"Authorization": "Bearer ck_wrong"}).status_code == 401

    listed = admin.get("/api/me/api-keys").json()
    assert len(listed) == 1 and "key" not in listed[0]

    assert admin.delete(f"/api/me/api-keys/{created['id']}").status_code == 200
    assert bare.get("/api/auth/me", headers={"Authorization": f"Bearer {key}"}).status_code == 401
