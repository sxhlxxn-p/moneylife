from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_health(monkeypatch) -> None:
    database_check = AsyncMock(return_value=None)
    monkeypatch.setattr("app.main.check_database_connection", database_check)

    response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "postgresql"}
    database_check.assert_awaited_once()


def test_database_health_when_connection_fails(monkeypatch) -> None:
    database_check = AsyncMock(
        side_effect=OperationalError("SELECT 1", {}, RuntimeError("offline"))
    )
    monkeypatch.setattr("app.main.check_database_connection", database_check)

    response = client.get("/health/db")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "database": "postgresql",
    }


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
    assert schema_response.json()["paths"]["/health/db"]["get"]["tags"] == ["system"]
    assert swagger_response.status_code == 200
    assert "Swagger UI" in swagger_response.text
    assert redoc_response.status_code == 200
    assert "ReDoc" in redoc_response.text
