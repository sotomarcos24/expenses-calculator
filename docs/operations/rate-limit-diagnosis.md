# Rate limit diagnosis (issue #59)

Operational diagnosis output, also serving as the rate-limit part of the production checks of #47.

## Symptom

In production on Render, repeated wrong logins never returned 429. Twelve failed logins from one machine were all answered 401, although the limit is 10 per 60 s.

## Logs

A temporary INFO log (phase 1 of #59, since removed) printed the forwarded header, the socket peer and the IP the limiter used. Representative lines (the user's public IP is masked, Cloudflare addresses are placeholders):

```text
TEMP #59 rate_limit scope=login xff='87.235.x.x, 172.69.x.x, 10.25.239.2' peer=10.25.239.2 trusted_proxy_count=1 chosen_ip=10.25.239.2
TEMP #59 rate_limit scope=login xff='87.235.x.x, 172.71.x.x, 10.24.86.133' peer=10.24.86.133 trusted_proxy_count=1 chosen_ip=10.24.86.133
TEMP #59 rate_limit scope=login xff='87.235.x.x, 162.158.x.x, 10.27.144.40' peer=10.27.144.40 trusted_proxy_count=1 chosen_ip=10.27.144.40
```

Observations over the 12 requests:

- Every header had 3 entries: `<client IP>, <Cloudflare IP>, <Render load balancer 10.x>`.
- The peer was always equal to the last entry.
- The Cloudflare IP changed almost every request; the Render load balancer alternated among 3 addresses (10.25.239.2, 10.24.86.133, 10.27.144.40).
- Only the first entry (the client's public IP) was constant.

## Cause

`TRUSTED_PROXY_COUNT` was `1`, so the limiter used the last entry (the Render load balancer) as the client IP. Requests were spread over 3 counters, none reaching 10 attempts in the window.

## Fix

`TRUSTED_PROXY_COUNT=3` in `render.yaml` (and in the README and `docs/tech-spec.md`). The limiter now uses the 3rd entry from the right, which is the real client IP. No change to `client_ip` was needed. The temporary log was removed. Regression tests in `backend/tests/integration/test_rate_limit.py` use the real 3-entry format with varying proxy addresses: the 11th attempt gets 429, a forged left prefix does not evade the limit, another client is not blocked, and `TRUSTED_PROXY_COUNT=1` is shown not to limit (the old bug).

## Why counting from the right is safe

Everything to the left of the entries appended by the trusted proxies is client-controlled: a client can send its own `X-Forwarded-For` and each proxy appends the address it saw. Only the entries added by our own proxies (the rightmost N) can be trusted, so the limiter takes the Nth from the right. A forged prefix such as `6.6.6.6, <real header>` only shifts the left side and does not change the selected entry.

## Limitation and re-diagnosis

The value depends on the number of hops in front of the app. If Render or Cloudflare add or remove a hop (for example Cloudflare is no longer in front), the count must be adjusted, otherwise the limiter keys on a proxy address (each hop address gets its own counter, as before) or on a client-controlled value (count too high, falling back to the peer when the header is too short). To re-diagnose, temporarily log the `X-Forwarded-For` header and the peer for a few login attempts (IPs only, never emails or passwords), count the entries, and check which one stays constant across requests from one machine: its position from the right is the value to use.

## Verification

- Automated: backend tests pass, including the regression tests above.
- Production check, run by the user on 2026-10-20 against the deployed commit `6b4b8f0` (the `deploy` job on `main` was green and `/api/health` reported that commit) with `TRUSTED_PROXY_COUNT=3`: 12 wrong logins in a row from one machine returned **401 for attempts 1-10 and 429 for attempts 11-12**. This is the expected behaviour (limit of 10 per 60 s) and confirms the fix.
