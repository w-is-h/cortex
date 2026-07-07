PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcffff3f030005fe02fea72d1e480000000049454e44ae426082"
)


def test_image_round_trip(admin):
    r = admin.post("/api/images", files={"file": ("shot.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    got = admin.get(url)
    assert got.status_code == 200
    assert got.content == PNG
    assert got.headers["content-type"] == "image/png"
    assert "immutable" in got.headers["cache-control"]


def test_image_validation(admin, client):
    assert admin.post("/api/images",
                      files={"file": ("x.txt", b"hi", "text/plain")}).status_code == 400
    assert admin.get("/api/images/nope").status_code == 404
    # auth required on both ends
    assert client.post("/api/images",
                       files={"file": ("s.png", PNG, "image/png")}).status_code == 401
