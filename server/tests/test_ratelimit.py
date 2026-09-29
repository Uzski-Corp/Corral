"""The Redis fixed-window limiter behind the email-code routes."""

from collections.abc import AsyncIterator
from typing import Any

import pytest
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from structlog.testing import capture_logs

from app.auth.ratelimit import (
    RateLimited,
    RateLimiter,
    RateRule,
    derive_secret,
    subject_key,
)


@pytest.fixture
async def redis(clean_redis: str) -> AsyncIterator[Redis]:
    client = Redis.from_url(clean_redis)
    try:
        yield client
    finally:
        await client.aclose()


async def test_allows_up_to_the_limit_then_reports_the_window(redis: Redis) -> None:
    limiter = RateLimiter(redis, timeout_s=1)
    rule = RateRule("t", 2, 30)
    await limiter.hit([(rule, "a")])
    await limiter.hit([(rule, "a")])
    with pytest.raises(RateLimited) as exc:
        await limiter.hit([(rule, "a")])
    assert exc.value.rule == "t"
    assert 1 <= exc.value.retry_after_s <= 30
    # The window is fixed: blocked requests do not extend it.
    assert 0 < await redis.ttl("corral:rl:t:a") <= 30
    await limiter.hit([(rule, "b")])


async def test_reports_the_longest_wait_of_all_tripped_rules(redis: Redis) -> None:
    limiter = RateLimiter(redis, timeout_s=1)
    short, long = RateRule("short", 1, 10), RateRule("long", 1, 500)
    await limiter.hit([(short, "x"), (long, "y")])
    with pytest.raises(RateLimited) as exc:
        await limiter.hit([(short, "x"), (long, "y")])
    assert exc.value.rule == "long"
    assert exc.value.retry_after_s > 10
    with pytest.raises(RateLimited) as exc:
        await limiter.hit([(long, "y"), (short, "x")])
    assert exc.value.rule == "long"


def test_subject_keys_are_stable_and_keyed() -> None:
    one, two = derive_secret("pw-one"), derive_secret("pw-two")
    assert subject_key(one, "a@b.c") == subject_key(one, "a@b.c")
    assert subject_key(one, "a@b.c") != subject_key(two, "a@b.c")
    assert len(subject_key(one, "a@b.c")) == 32
    assert "a@b.c" not in subject_key(one, "a@b.c")


class _BrokenPipeline:
    def __init__(self, result: Any = None, error: Exception | None = None) -> None:
        self.result, self.error = result, error

    async def __aenter__(self) -> "_BrokenPipeline":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def incr(self, key: str) -> None: ...

    def expire(self, key: str, seconds: int, *, nx: bool) -> None: ...

    def ttl(self, key: str) -> None: ...

    async def execute(self) -> Any:
        if self.error:
            raise self.error
        return self.result


class _FakeRedis:
    def __init__(self, pipeline: _BrokenPipeline) -> None:
        self._pipeline = pipeline

    def pipeline(self, *, transaction: bool) -> _BrokenPipeline:
        return self._pipeline


@pytest.mark.parametrize("error", [RedisConnectionError("down"), OSError("reset"), TimeoutError()])
async def test_fails_open_when_redis_errors(error: Exception) -> None:
    limiter = RateLimiter(_FakeRedis(_BrokenPipeline(error=error)), timeout_s=1)  # type: ignore[arg-type]
    with capture_logs() as logs:
        await limiter.hit([(RateRule("t", 1, 10), "a")])
    assert logs[0]["event"] == "rate_limit_unavailable"
    assert logs[0]["error_type"] == type(error).__name__


async def test_missing_ttl_falls_back_to_the_window() -> None:
    limiter = RateLimiter(_FakeRedis(_BrokenPipeline(result=[5, True, -1])), timeout_s=1)  # type: ignore[arg-type]
    with pytest.raises(RateLimited) as exc:
        await limiter.hit([(RateRule("t", 1, 77), "a")])
    assert exc.value.retry_after_s == 77
