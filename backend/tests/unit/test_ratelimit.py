from app.ratelimit import RateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_limit_then_blocks_with_retry_after() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    for _ in range(3):
        assert limiter.hit("login", "1.1.1.1", 3, 60) is None
    clock.now += 10
    assert limiter.hit("login", "1.1.1.1", 3, 60) == 50


def test_retry_after_is_at_least_one_second() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    limiter.hit("login", "ip", 1, 60)
    clock.now += 59.9
    assert limiter.hit("login", "ip", 1, 60) == 1


def test_window_expiry_allows_again() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    limiter.hit("login", "ip", 1, 60)
    assert limiter.hit("login", "ip", 1, 60) is not None
    clock.now += 60
    assert limiter.hit("login", "ip", 1, 60) is None


def test_scopes_and_keys_are_independent() -> None:
    limiter = RateLimiter(FakeClock())
    assert limiter.hit("login", "a", 1, 60) is None
    assert limiter.hit("login", "a", 1, 60) is not None
    assert limiter.hit("register", "a", 1, 60) is None
    assert limiter.hit("login", "b", 1, 60) is None


def test_zero_limit_disables() -> None:
    limiter = RateLimiter(FakeClock())
    for _ in range(100):
        assert limiter.hit("login", "ip", 0, 60) is None
    assert len(limiter) == 0


def test_expired_entries_are_purged() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    limiter.hit("login", "a", 5, 60)
    limiter.hit("login", "b", 5, 60)
    assert len(limiter) == 2
    clock.now += 61
    limiter.hit("login", "c", 5, 60)
    assert len(limiter) == 1
