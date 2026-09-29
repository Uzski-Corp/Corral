import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from arq import Retry, Worker, func
from arq.jobs import Job, JobStatus
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.session import Database
from app.models import Lead
from app.worker.jobs import count_org_leads, retry_delay_s
from app.worker.main import WorkerSettings, build_worker_kwargs, redis_settings
from app.worker.queue import QUEUE_NAME, JobQueue
from tests.conftest import make_settings
from tests.tenancy_helpers import provision


@pytest.mark.parametrize(("job_try", "delay"), [(0, 2), (1, 2), (2, 4), (3, 8), (6, 60), (50, 60)])
def test_retry_delay_is_exponential_and_capped(job_try: int, delay: float) -> None:
    assert retry_delay_s(job_try) == delay


def test_worker_kwargs_follow_settings() -> None:
    kwargs = build_worker_kwargs(
        make_settings(worker_job_timeout_s=7, worker_max_tries=3, worker_shutdown_grace_s=9)
    )
    (job,) = kwargs["functions"]
    assert (job.name, job.timeout_s, job.max_tries) == ("count_org_leads", 7, 3)
    assert kwargs["job_completion_wait"] == 9
    assert kwargs["queue_name"] == QUEUE_NAME
    assert kwargs["retry_jobs"] is True


def test_redis_settings_from_dsn() -> None:
    rs = redis_settings(make_settings(redis_url="redis://:pw@cache:6380/3", redis_timeout_s=1.2))
    assert (rs.host, rs.port, rs.database, rs.password, rs.conn_timeout) == (
        "cache",
        6380,
        3,
        "pw",
        2,
    )


def test_cli_worker_settings_class_is_complete() -> None:
    assert WorkerSettings.functions[0].name == "count_org_leads"
    assert WorkerSettings.queue_name == QUEUE_NAME
    assert WorkerSettings.redis_settings.port > 0


async def test_lifecycle_hooks_own_the_database() -> None:
    kwargs = build_worker_kwargs(make_settings())
    ctx: dict[str, Any] = {}
    await kwargs["on_startup"](ctx)
    assert isinstance(ctx["db"], Database)
    await kwargs["on_shutdown"](ctx)
    await kwargs["on_shutdown"]({})  # tolerate a failed startup


async def test_count_org_leads_is_tenant_scoped(db_engine: AsyncEngine) -> None:
    a = await provision(db_engine, "user_a", "a@a.io", "org_a")
    b = await provision(db_engine, "user_b", "b@b.io", "org_b")
    async with AsyncSession(db_engine) as s, s.begin():
        s.add_all(
            [
                Lead(org_id=a.org_id, email="1@a.io"),
                Lead(org_id=a.org_id, email="2@a.io"),
                Lead(org_id=b.org_id, email="1@b.io"),
            ]
        )
    ctx = {"db": Database(db_engine), "job_try": 1}
    assert await count_org_leads(ctx, str(a.org_id)) == 2
    assert await count_org_leads(ctx, str(b.org_id)) == 1
    assert await count_org_leads(ctx, str(uuid.uuid4())) == 0


async def test_count_org_leads_rejects_malformed_org_id() -> None:
    with pytest.raises(ValueError):
        await count_org_leads({"db": MagicMock()}, "not-a-uuid")


def failing_db(error: BaseException) -> MagicMock:
    db = MagicMock()
    db.sessionmaker.side_effect = error
    return db


@pytest.mark.parametrize(("job_try", "defer_ms"), [(1, 2000), (2, 4000), (4, 16000)])
async def test_transient_failure_retries_with_backoff(job_try: int, defer_ms: int) -> None:
    ctx = {"db": failing_db(OSError("connection reset")), "job_try": job_try}
    with pytest.raises(Retry) as err:
        await count_org_leads(ctx, str(uuid.uuid4()))
    assert err.value.defer_score == defer_ms


async def test_permanent_failure_is_not_retried() -> None:
    ctx = {"db": failing_db(RuntimeError("bug")), "job_try": 1}
    with pytest.raises(RuntimeError):
        await count_org_leads(ctx, str(uuid.uuid4()))


# --- against a real Redis -------------------------------------------------------------------


@pytest.fixture
async def queue(clean_redis: str) -> AsyncIterator[JobQueue]:
    q = JobQueue.from_settings(make_settings(redis_url=clean_redis))
    try:
        yield q
    finally:
        await q.close()


def make_worker(queue: JobQueue, functions: list[Any], **overrides: Any) -> Worker:
    return Worker(
        functions=functions,
        redis_pool=queue.redis,
        queue_name=QUEUE_NAME,
        burst=True,
        handle_signals=False,
        poll_delay=0.01,
        keep_result=60,
        **overrides,
    )


async def test_queue_ping(queue: JobQueue) -> None:
    await queue.ping()


async def test_enqueue_and_process_sample_job_end_to_end(
    queue: JobQueue, migrated_database: str, db_engine: AsyncEngine
) -> None:
    a = await provision(db_engine, "user_a", "a@a.io", "org_a")
    async with AsyncSession(db_engine) as s, s.begin():
        s.add(Lead(org_id=a.org_id, email="1@a.io"))
    job = await queue.enqueue_count_org_leads(a.org_id)
    assert isinstance(job, Job)
    assert await queue.enqueue_count_org_leads(a.org_id) is None  # deduplicated by job id

    settings = make_settings(database_url=migrated_database, redis_url="redis://unused")
    kwargs = build_worker_kwargs(settings)
    kwargs.pop("queue_name")
    worker = Worker(
        **kwargs,
        redis_pool=queue.redis,
        queue_name=QUEUE_NAME,
        burst=True,
        handle_signals=False,
        poll_delay=0.01,
    )
    await worker.main()
    await worker.close()
    assert await job.result(timeout=5) == 1
    assert worker.jobs_complete == 1


async def test_worker_retries_transient_failures(queue: JobQueue) -> None:
    attempts: list[int] = []

    async def flaky(ctx: dict[str, Any]) -> str:
        attempts.append(ctx["job_try"])
        if ctx["job_try"] < 3:
            raise Retry(defer=0.01)
        return "ok"

    job = await queue.redis.enqueue_job("flaky")
    assert job is not None
    worker = make_worker(queue, [func(flaky, name="flaky")], max_tries=5)
    await worker.main()
    await worker.close()
    assert await job.result(timeout=5) == "ok"
    assert attempts == [1, 2, 3]
    assert worker.jobs_retried == 2


async def test_worker_gives_up_after_max_tries(queue: JobQueue) -> None:
    async def always_down(ctx: dict[str, Any]) -> None:
        raise Retry(defer=0.01)

    job = await queue.redis.enqueue_job("always_down")
    assert job is not None
    worker = make_worker(queue, [func(always_down, name="always_down", max_tries=2)])
    await worker.main()
    await worker.close()
    with pytest.raises(Exception, match="max 2 retries exceeded"):
        await job.result(timeout=5)
    assert worker.jobs_failed == 1


async def test_worker_enforces_job_timeout(queue: JobQueue) -> None:
    async def slow(ctx: dict[str, Any]) -> None:
        await asyncio.sleep(5)

    job = await queue.redis.enqueue_job("slow")
    assert job is not None
    worker = make_worker(queue, [func(slow, name="slow", timeout=0.1, max_tries=1)])
    await worker.main()
    await worker.close()
    with pytest.raises(asyncio.TimeoutError):
        await job.result(timeout=5)
    assert await job.status() == JobStatus.complete


async def test_app_lifespan_closes_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.main import create_app

    close = AsyncMock()
    monkeypatch.setattr(JobQueue, "close", close)
    app = create_app(make_settings())
    async with app.router.lifespan_context(app):
        assert isinstance(app.state.queue, JobQueue)
        assert app.state.draining is False
    close.assert_awaited_once()
    assert app.state.draining is True
