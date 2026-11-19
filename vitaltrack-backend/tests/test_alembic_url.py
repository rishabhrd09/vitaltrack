"""Exercise the real Alembic environment without connecting to a database."""

from contextlib import nullcontext
from pathlib import Path
import runpy

from alembic import context
from alembic.config import Config
import pytest

from app.core.config import settings


@pytest.mark.parametrize("url", [
    "postgresql+asyncpg://user:pass@localhost/example_test",
    "postgresql+asyncpg://user:pass%40word%25@localhost/example_test",
])
def test_alembic_environment_preserves_percent_encoded_url(monkeypatch, url):
    config = Config()
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(context, "config", config, raising=False)
    monkeypatch.setattr(context, "is_offline_mode", lambda: True)
    monkeypatch.setattr(context, "configure", lambda **kwargs: None)
    monkeypatch.setattr(context, "begin_transaction", nullcontext)
    monkeypatch.setattr(context, "run_migrations", lambda: None)
    runpy.run_path(str(Path(__file__).resolve().parents[1] / "alembic/env.py"))
    assert config.get_main_option("sqlalchemy.url") == url
