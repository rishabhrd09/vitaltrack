"""Ingress/limiter tests run independently of the database fixture.

TEST_REDIS_URL enables real cross-process tests (mandatory in CI). Only unique,
short-lived namespaced keys are written; these tests never flush a Redis DB.
"""

import asyncio
import json
import os
import runpy
import shlex
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, Request
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from app.core.config import Settings
from app.services.ai_body_limit import AIBodyLimit
from app.services.ingress import (
    IngressGuard,
    RequestCapacity,
    validate_ingress_settings,
)
from app.utils.rate_limiter import (
    build_limiter,
    get_real_client_ip,
    rate_limit_exceeded_handler,
)

SECRET = "local-test-only-edge-secret-not-for-deployment"


def config(**values):
    return Settings(
        _env_file=None,
        **{
            "ENVIRONMENT": "testing",
            "INGRESS_MODE": "direct",
            "ALLOWED_HOSTS": ["api.test"],
            "RATE_LIMIT_STORAGE_URI": "memory://",
            **values,
        },
    )


def inspection_app(configured):
    application = FastAPI()

    @application.api_route("/{path:path}", methods=["GET", "POST", "HEAD"])
    async def inspect_request(request: Request):
        return {
            "ip": get_real_client_ip(request),
            "scheme": request.url.scheme,
            "headers": dict(request.headers),
        }

    application.add_middleware(IngressGuard, config=configured)
    return application


async def request(
    app, headers=None, path="/api/v1/auth/me", peer="192.0.2.10", method="GET"
):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=(peer, 4567)),
        base_url="http://api.test",
    ) as client:
        return await client.request(method, path, headers=headers)


async def test_untrusted_forwarding_headers_cannot_change_identity_or_scheme():
    app = inspection_app(config())
    response = await request(
        app,
        {
            "CF-Connecting-IP": "1.2.3.4",
            "X-Forwarded-For": "5.6.7.8",
            "Forwarded": "for=9.9.9.9",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "evil.test",
        },
    )
    assert response.status_code == 200
    assert response.json()["ip"] == "192.0.2.10"
    assert response.json()["scheme"] == "http"
    assert "x-forwarded-host" not in response.json()["headers"]


async def test_trusted_proxy_walks_chain_from_socket_not_attacker_supplied_leftmost_ip():
    app = inspection_app(
        config(INGRESS_MODE="trusted_proxy", TRUSTED_PROXY_CIDRS=["10.0.0.0/24"])
    )
    headers = {
        "X-Forwarded-For": "203.0.113.99, 198.51.100.42, 10.0.0.5",
        "X-Forwarded-Proto": "https",
        "CF-Connecting-IP": "203.0.113.99",
    }
    response = await request(app, headers, peer="10.0.0.2")
    assert response.json()["ip"] == "198.51.100.42"
    assert response.json()["scheme"] == "https"
    untrusted = await request(app, headers)
    assert untrusted.status_code == 503
    assert untrusted.headers["retry-after"] == "30"


@pytest.mark.parametrize(
    "chain",
    [
        "",
        "unknown",
        "198.51.100.42, garbage",
        ",198.51.100.42",
        ",".join(["1.2.3.4"] * 17),
        "10.0.0.5",
        "fe80::1%lo0",
    ],
)
async def test_invalid_trusted_proxy_chains_are_rejected(chain):
    app = inspection_app(
        config(INGRESS_MODE="trusted_proxy", TRUSTED_PROXY_CIDRS=["10.0.0.0/24"])
    )
    assert (
        await request(
            app,
            {"X-Forwarded-For": chain, "X-Forwarded-Proto": "https"},
            peer="10.0.0.2",
        )
    ).status_code == 400


async def test_edge_secret_rejects_direct_origin_and_strips_secret_after_verification():
    app = inspection_app(
        config(INGRESS_MODE="edge_secret", ORIGIN_VERIFY_SECRET=SECRET)
    )
    assert (await request(app, {"CF-Connecting-IP": "1.2.3.4"})).status_code == 503
    assert (
        await request(app, {"X-CareKosh-Origin-Verify": "wrong"})
    ).status_code == 503
    headers = {
        "X-CareKosh-Origin-Verify": SECRET,
        "CF-Connecting-IP": "::ffff:198.51.100.42",
        "X-Forwarded-For": "garbage",
        "X-Forwarded-Host": "evil.test",
    }
    result = await request(app, headers)
    assert result.status_code == 200
    assert result.json()["ip"] == "198.51.100.42"
    assert result.json()["scheme"] == "https"
    assert SECRET not in result.text
    assert "origin" not in result.json()["headers"]  # Native apps need no Origin.
    assert (await request(app, path="/live")).status_code == 200
    assert (await request(app, path="/health")).status_code == 503
    assert (await request(app, path="/live", method="POST")).status_code == 503


@pytest.mark.parametrize(
    "headers",
    [
        [("X-CareKosh-Origin-Verify", SECRET), ("X-CareKosh-Origin-Verify", SECRET)],
        [
            ("X-CareKosh-Origin-Verify", SECRET),
            ("CF-Connecting-IP", "1.2.3.4"),
            ("CF-Connecting-IP", "5.6.7.8"),
        ],
        [
            ("X-CareKosh-Origin-Verify", SECRET),
            ("CF-Connecting-IP", "1.2.3.4, 5.6.7.8"),
        ],
    ],
)
async def test_ambiguous_edge_headers_are_rejected(headers):
    app = inspection_app(
        config(INGRESS_MODE="edge_secret", ORIGIN_VERIFY_SECRET=SECRET)
    )
    assert (await request(app, headers)).status_code == 400


@pytest.mark.parametrize(
    "host",
    [
        "evil.test",
        "api.test.evil.test",
        "api.test@evil.test",
        "api.test/path",
        "api.test:99999",
        "api.test?x=1",
    ],
)
async def test_host_validation(host):
    assert (await request(inspection_app(config()), {"Host": host})).status_code == 400


@pytest.mark.parametrize(
    "values",
    [
        {"INGRESS_MODE": "trusted_proxy"},
        {"INGRESS_MODE": "trusted_proxy", "TRUSTED_PROXY_CIDRS": ["0.0.0.0/0"]},
        {"INGRESS_MODE": "trusted_proxy", "TRUSTED_PROXY_CIDRS": ["::/0"]},
        {"INGRESS_MODE": "edge_secret"},
        {"ALLOWED_HOSTS": ["*"]},
        {"ALLOWED_HOSTS": ["https://api.test"]},
    ],
)
def test_unsafe_ingress_configuration_fails_startup(values):
    with pytest.raises(RuntimeError):
        validate_ingress_settings(config(**values))


def test_hosted_environments_require_shared_store_and_explicit_ingress():
    for environment in ("staging", "production"):
        configured = config(
            ENVIRONMENT=environment,
            SECRET_KEY=SECRET,
            FRONTEND_URL="https://api.test/api/v1/auth",
        )
        with pytest.raises(RuntimeError, match="shared Redis"):
            build_limiter(configured)
        with pytest.raises(RuntimeError, match="explicit INGRESS_MODE"):
            validate_ingress_settings(configured)
        configured.INGRESS_MODE = "edge_secret"
        configured.ORIGIN_VERIFY_SECRET = configured.SECRET_KEY
        configured.CORS_ORIGINS = ["*"]
        with pytest.raises(RuntimeError, match="exact HTTPS origins"):
            validate_ingress_settings(configured)


@pytest.mark.parametrize(
    "uri",
    [
        "rediss://redis.test/0?ssl_cert_reqs=none",
        "redis://redis.test/0?socket_timeout=500",
        "redis:///0",
        "redis://redis.test:99999/0",
    ],
)
def test_store_uri_cannot_override_transport_security_or_deadlines(uri):
    with pytest.raises(RuntimeError):
        build_limiter(config(RATE_LIMIT_STORAGE_URI=uri))


def limited_app(configured, limit="5/minute"):
    limiter = build_limiter(configured)
    application = FastAPI()
    application.state.limiter = limiter
    application.state.calls = 0
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @application.get("/native")
    @limiter.shared_limit(limit, scope="auth:login")
    async def native(request: Request):
        application.state.calls += 1
        return {"ok": True}

    @application.get("/browser")
    @limiter.shared_limit(limit, scope="auth:login")
    async def browser(request: Request):
        application.state.calls += 1
        return {"ok": True}

    return application


async def test_legacy_settings_cannot_disable_limits_and_transports_share_bucket(
    monkeypatch,
):
    monkeypatch.setenv("RATELIMIT_ENABLED", "false")
    monkeypatch.setenv("RATELIMIT_SWALLOW_ERRORS", "true")
    monkeypatch.setenv("RATELIMIT_IN_MEMORY_FALLBACK_ENABLED", "true")
    application = limited_app(config())
    for i in range(5):
        assert (
            await request(
                application,
                {"X-Forwarded-For": f"1.2.3.{i}"},
                path="/native" if i % 2 else "/browser",
            )
        ).status_code == 200
    denied = await request(application, path="/browser")
    assert denied.status_code == 429 and denied.headers["retry-after"] == "60"
    assert "Rate limit exceeded" in denied.json()["error"]
    assert application.state.calls == 5


async def test_ipv6_clients_share_one_bucket_per_64_prefix():
    # Rotating addresses inside one /64 must not mint fresh login quotas.
    application = limited_app(config())
    for i in range(5):
        assert (
            await request(application, path="/native", peer=f"2001:db8:1:2::{i + 10:x}")
        ).status_code == 200
    rotated = await request(application, path="/browser", peer="2001:db8:1:2:ffff::1")
    assert rotated.status_code == 429
    assert (await request(application, path="/native", peer="2001:db8:1:3::1")).status_code == 200
    assert (await request(application, path="/native", peer="192.0.2.77")).status_code == 200
    assert application.state.calls == 7


async def test_store_failure_is_503_before_side_effect_and_recovers(monkeypatch):
    from redis.exceptions import ConnectionError
    from limits.errors import StorageError

    application = limited_app(config())
    storage = application.state.limiter._storage
    increment = storage.incr

    def broken(*args, **kwargs):
        raise StorageError(ConnectionError("secret-store-password"))

    monkeypatch.setattr(storage, "incr", broken)
    for _ in range(2):
        response = await request(application, path="/native")
        assert response.status_code == 503 and response.headers["retry-after"] == "5"
        assert "secret-store-password" not in response.text
    assert application.state.calls == 0
    monkeypatch.setattr(storage, "incr", increment)
    assert (await request(application, path="/native")).status_code == 200


async def test_fail_open_reads_stay_limited_while_the_store_works(monkeypatch):
    from limits.errors import StorageError

    limiter = build_limiter(config())
    application = FastAPI()
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @application.get("/read")
    @limiter.limit("2/minute", fail_open=True)
    async def read(request: Request):
        return {"ok": True}

    statuses = [(await request(application, path="/read")).status_code for _ in range(3)]
    assert statuses == [200, 200, 429]

    def broken(*args, **kwargs):
        raise StorageError(ConnectionError("store down"))

    # Only an unavailable store lets this read through without its limit.
    monkeypatch.setattr(limiter._storage, "incr", broken)
    assert (await request(application, path="/read")).status_code == 200


async def test_slow_store_does_not_block_event_loop(monkeypatch):
    application = limited_app(config())
    storage = application.state.limiter._storage
    increment = storage.incr
    entered = asyncio.Event()
    loop = asyncio.get_running_loop()

    def slow(*args, **kwargs):
        loop.call_soon_threadsafe(entered.set)
        time.sleep(0.25)
        return increment(*args, **kwargs)

    monkeypatch.setattr(storage, "incr", slow)
    pending = asyncio.create_task(request(application, path="/native"))
    await entered.wait()
    await asyncio.sleep(0.01)
    assert not pending.done()
    assert (await pending).status_code == 200


async def test_capacity_rejects_overload_keeps_liveness_and_recovers_after_cancellation():
    entered, release = asyncio.Event(), asyncio.Event()

    async def downstream(scope, receive, send):
        if scope["path"] != "/live":
            entered.set()
            await release.wait()
        await JSONResponse({"ok": True})(scope, receive, send)

    app = RequestCapacity(downstream, maximum=1)
    pending = asyncio.create_task(request(app))
    await entered.wait()
    denied = await request(app)
    assert denied.status_code == 503 and denied.headers["retry-after"] == "2"
    assert (await request(app, path="/live")).status_code == 200
    pending.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pending
    release.set()
    assert (await request(app)).status_code == 200


async def test_non_ai_slow_body_is_bounded_before_handler_runs():
    calls, messages = [], []

    async def downstream(scope, receive, send):
        calls.append(True)

    async def stalled():
        await asyncio.sleep(1)

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "headers": [],
    }
    await AIBodyLimit(downstream, api_timeout=0.01)(scope, stalled, send)
    assert messages[0]["status"] == 408 and not calls


async def test_liveness_never_buffers_a_body_outside_admission_control():
    messages = []

    async def downstream(scope, receive, send):
        await JSONResponse({"ok": True})(scope, receive, send)

    async def receive():
        pytest.fail("Liveness must not buffer request bodies")

    async def send(message):
        messages.append(message)

    await AIBodyLimit(downstream)(
        {"type": "http", "method": "GET", "path": "/live", "headers": []}, receive, send
    )
    assert messages[0]["status"] == 200


def test_gunicorn_worker_disables_framework_proxy_rewriting():
    from gunicorn.config import Config
    from app.worker import CareKoshUvicornWorker

    cfg = Config()
    cfg.set("forwarded_allow_ips", "*")  # Even an inherited wildcard cannot win.
    cfg.set("accesslog", "-")
    logger = cfg.logger_class(cfg)
    worker = CareKoshUvicornWorker(0, 1, [], None, 30, cfg, logger)
    assert worker.config.proxy_headers is False
    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text()
    assert "app.worker.CareKoshUvicornWorker" in dockerfile


async def test_python_entrypoint_preserves_socket_peer_for_ingress(monkeypatch):
    import uvicorn

    calls = []
    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")
    backend = Path(__file__).resolve().parents[1]
    runpy.run_path(str(backend / "app/main.py"), run_name="__main__")
    assert len(calls) == 1 and calls[0][0] == ("app.main:app",)
    assert calls[0][1]["proxy_headers"] is False

    application = inspection_app(
        config(INGRESS_MODE="trusted_proxy", TRUSTED_PROXY_CIDRS=["10.0.0.0/24"])
    )
    server = uvicorn.Config(application, proxy_headers=calls[0][1]["proxy_headers"])
    server.load()  # Load the real middleware stack without opening a socket.
    response = await request(
        server.loaded_app,
        {"X-Forwarded-For": "198.51.100.42", "X-Forwarded-Proto": "https"},
        peer="10.0.0.2",
    )
    # A premature Uvicorn rewrite changes the peer and makes this a refusal.
    assert response.status_code == 200
    assert response.json()["ip"] == "198.51.100.42"


@pytest.mark.parametrize("filename", ["Dockerfile.dev", "README.md"])
def test_maintained_cli_launchers_preserve_socket_peer(filename):
    backend = Path(__file__).resolve().parents[1]
    commands = []
    for line in (backend / filename).read_text().splitlines():
        if "uvicorn app.main:app " not in line:
            continue
        tokens = shlex.split(line.rstrip().removesuffix("\\"))
        command = tokens[1] if tokens[0] == "echo" else line
        commands.append(shlex.split(command))
    assert commands
    for tokens in commands:
        assert "--no-proxy-headers" in tokens
        assert "--proxy-headers" not in tokens


@pytest.mark.skipif(
    not os.environ.get("TEST_REDIS_URL"),
    reason="Set TEST_REDIS_URL to a disposable local Redis (CI requires it)",
)
async def test_real_redis_shared_across_processes_and_worker_restarts():
    prefix = f"pytest-{uuid4().hex}"
    env = {**os.environ, "PROBE_PREFIX": prefix}
    # Match CI and prove that children do not rely on a developer's import path.
    env.pop("PYTHONPATH", None)

    async def worker(count):
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "unit_tests.test_ingress_security",
            str(count),
            cwd=Path(__file__).resolve().parents[1],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        output, errors = await process.communicate()
        assert process.returncode == 0, errors.decode()
        return json.loads(output)

    first, second = await asyncio.gather(worker(4), worker(4))
    statuses = first + second
    assert statuses.count(200) == 5 and statuses.count(429) == 3
    assert await worker(1) == [429]  # New process cannot reset the shared window.


@pytest.mark.skipif(
    not os.environ.get("TEST_REDIS_URL"),
    reason="Set TEST_REDIS_URL for real Redis verification",
)
async def test_real_redis_expiry_and_unreachable_store_fail_closed():
    configured = config(
        RATE_LIMIT_STORAGE_URI=os.environ["TEST_REDIS_URL"],
        RATE_LIMIT_KEY_PREFIX=f"pytest-{uuid4().hex}",
    )
    application = limited_app(configured, "1/second")
    assert (await request(application, path="/native")).status_code == 200
    assert (await request(application, path="/native")).status_code == 429
    await asyncio.sleep(1.1)
    assert (await request(application, path="/native")).status_code == 200
    # Disconnect this client's pool and point it at a closed local port. The
    # real Redis driver fails, then reconnects to the same server and counters.
    from redis import ConnectionPool

    redis_client = application.state.limiter._storage.storage
    original_pool = redis_client.connection_pool
    failed_pool = ConnectionPool.from_url(
        "redis://127.0.0.1:1/0", socket_connect_timeout=0.1, socket_timeout=0.1
    )
    redis_client.connection_pool = failed_pool
    try:
        response = await request(application, path="/native")
        assert response.status_code == 503 and application.state.calls == 2
    finally:
        failed_pool.disconnect()
        redis_client.connection_pool = original_pool
    await asyncio.sleep(1.1)
    assert (await request(application, path="/native")).status_code == 200


if __name__ == "__main__":

    async def probe():
        app = limited_app(
            config(
                RATE_LIMIT_STORAGE_URI=os.environ["TEST_REDIS_URL"],
                RATE_LIMIT_KEY_PREFIX=os.environ["PROBE_PREFIX"],
            )
        )
        return [
            (await request(app, path="/native" if i % 2 else "/browser")).status_code
            for i in range(int(sys.argv[1]))
        ]

    print(json.dumps(asyncio.run(probe())))
