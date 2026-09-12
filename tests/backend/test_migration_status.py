"""A failed startup migration must be visible, not just a log line.

The API deliberately keeps serving when migrations fail, which is right, but the
failure was only logged at WARNING — and on a real dev database it never reached
the log at all — so the schema sat at an old revision with nobody aware.
/health now reports the migration state (state only: /health is public, so no
error text that could carry connection details).
"""
import pytest


@pytest.fixture
def run_migrations_for_real(monkeypatch, tmp_path):
    """Call _run_alembic_migrations without its under-pytest skip.

    pytest re-sets PYTEST_CURRENT_TEST when the test body starts, so the variable
    has to be removed inside the call, not during fixture setup.
    """
    from axalon.api import deps

    monkeypatch.setenv("AXALON_DB_URL", f"sqlite:///{tmp_path / 'status.db'}")
    # Restore the process-global status afterwards so other tests see the default.
    monkeypatch.setitem(deps.MIGRATION_STATUS, "state", deps.MIGRATION_STATUS["state"])

    def _run():
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        deps._run_alembic_migrations()

    return _run


def test_failed_migration_is_reported_on_health(client, monkeypatch, run_migrations_for_real):
    from alembic import command
    from axalon.api import deps

    def boom(*_a, **_k):
        raise RuntimeError("table users already exists")

    monkeypatch.setattr(command, "upgrade", boom)

    run_migrations_for_real()

    assert deps.MIGRATION_STATUS["state"] == "failed"
    body = client.get("/health").json()
    assert body["migrations"] == {"state": "failed"}


def test_successful_migration_is_reported_on_health(client, monkeypatch, run_migrations_for_real):
    from alembic import command
    from axalon.api import deps

    monkeypatch.setattr(command, "upgrade", lambda *_a, **_k: None)

    run_migrations_for_real()

    assert deps.MIGRATION_STATUS["state"] == "ok"
    assert client.get("/health").json()["migrations"] == {"state": "ok"}
