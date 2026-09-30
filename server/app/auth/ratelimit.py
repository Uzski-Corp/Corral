"""Fixed-window rate limits for the email-code sign-in routes, kept in Redis.

WorkOS enforces its own limits (Magic Auth: 3 codes per email per minute; authenticate:
10 attempts per email per minute). Ours sit in front of it so a single email address or
client IP cannot drive WorkOS into its limits for everyone else, and so abusive traffic
never reaches WorkOS at all.

Subjects (email addresses, IPs) are never stored or logged in plaintext: they are keyed
with an HMAC derived from the cookie secret, so Redis contents cannot be reversed with a
dictionary of known addresses.

Redis being down must not lock everyone out of signing in, so the limiter fails open
(and logs); WorkOS's own limits still apply in that case.
"""

import asyncio
import hashlib
import hmac
from dataclasses import dataclass

import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError

log = structlog.get_logger(__name__)

KEY_PREFIX = "corral:rl"


@dataclass(frozen=True, slots=True)
class RateRule:
    name: str
    limit: int
    window_s: int


class RateLimited(Exception):
    def __init__(self, rule: str, retry_after_s: int) -> None:
        super().__init__(rule)
        self.rule = rule
        self.retry_after_s = retry_after_s


def subject_key(secret: bytes, value: str) -> str:
    """A stable, non-reversible reference to ``value`` (safe for Redis keys and logs)."""
    return hmac.new(secret, value.encode(), hashlib.sha256).hexdigest()[:32]


def derive_secret(cookie_password: str) -> bytes:
    return hashlib.sha256(b"corral-auth-subject\x00" + cookie_password.encode()).digest()


class RateLimiter:
    def __init__(self, redis: Redis, *, timeout_s: float) -> None:
        self._redis = redis
        self._timeout_s = timeout_s

    async def _count(self, rule: RateRule, subject: str) -> tuple[int, int]:
        key = f"{KEY_PREFIX}:{rule.name}:{subject}"
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, rule.window_s, nx=True)
            pipe.ttl(key)
            count, _, ttl = await pipe.execute()
        return int(count), int(ttl)

    async def hit(self, checks: list[tuple[RateRule, str]]) -> None:
        """Count one request against every ``(rule, subject)``; raise if any is over."""
        retry_after = 0
        tripped: str | None = None
        for rule, subject in checks:
            try:
                async with asyncio.timeout(self._timeout_s):
                    count, ttl = await self._count(rule, subject)
            except (RedisError, OSError, TimeoutError) as exc:
                log.warning("rate_limit_unavailable", rule=rule.name, error_type=type(exc).__name__)
                continue
            if count > rule.limit:
                # ttl is -1/-2 only if the key vanished between commands; use the window.
                wait = ttl if ttl > 0 else rule.window_s
                if wait > retry_after:
                    retry_after, tripped = wait, rule.name
        if tripped is not None:
            log.info("rate_limited", rule=tripped, retry_after_s=retry_after)
            raise RateLimited(tripped, retry_after)
