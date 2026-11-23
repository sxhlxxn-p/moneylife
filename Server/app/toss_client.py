"""Outbound boundary for Toss: authentication and read-only daily candles only."""

import httpx

BASE_URL = "https://openapi.tossinvest.com"
ALLOWED_REQUESTS = frozenset({("POST", b"/oauth2/token"), ("GET", b"/api/v1/candles")})


class MarketProviderError(ValueError):
    pass


def validate_request(request: httpx.Request) -> None:
    url = request.url
    if (
        url.scheme != "https"
        or url.host != "openapi.tossinvest.com"
        or url.port not in (None, 443)
        or url.username
        or url.password
        or url.fragment
        or (request.method, url.raw_path.split(b"?", 1)[0]) not in ALLOWED_REQUESTS
        or "X-Tossinvest-Account" in request.headers
        or (request.method == "POST" and url.query)
    ):
        raise MarketProviderError("MARKET_REQUEST_BLOCKED")


async def enforce_read_only(request: httpx.Request) -> None:
    validate_request(request)


def read_only_client(**kwargs) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        trust_env=False,
        follow_redirects=False,
        event_hooks={"request": [enforce_read_only]},
        **kwargs,
    )


async def request_toss(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    # Validate even when a caller supplies its own client (e.g. a test transport).
    request = client.build_request(method, url, timeout=15, **kwargs)
    validate_request(request)
    return await client.send(request, follow_redirects=False)
