from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_redirects_to_swagger() -> None:
    response = client.get("/", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_openapi_documentation_is_available() -> None:
    schema_response = client.get("/openapi.json")
    swagger_response = client.get("/docs")
    redoc_response = client.get("/redoc")

    assert schema_response.status_code == 200
    assert schema_response.json()["info"]["title"] == "MoneyLife API"
    assert schema_response.json()["paths"]["/health"]["get"]["tags"] == ["system"]
    assert swagger_response.status_code == 200
    assert "Swagger UI" in swagger_response.text
    assert redoc_response.status_code == 200
    assert "ReDoc" in redoc_response.text
