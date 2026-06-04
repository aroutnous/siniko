"""Client Redis partagé (rate limiting, cache sessions)."""

from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_redis_client() -> redis.Redis:
    """Connexion Redis singleton."""
    return redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
    )
