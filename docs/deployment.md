# Deployment

> How PersonalDolar is built, shipped and run in production. The README links here; local runs are in the README and [`backend.md`](backend.md).

The app ships as one Docker image (root [`Dockerfile`](../Dockerfile)): FastAPI serves `/api` and the built frontend from the same origin, and the entrypoint runs `alembic upgrade head` before starting `uvicorn`, so migrations run on every deploy. The chosen host is [Render](https://render.com) (free web service + free Postgres), described by the [`render.yaml`](../render.yaml) Blueprint. Public URL: <https://personaldolar.onrender.com>.

## Environment variables

Never commit values for these; set them in the provider's dashboard or secret store.

| Variable | Purpose | Example placeholder |
| --- | --- | --- |
| `ENVIRONMENT` | `production` makes startup fail on an insecure `JWT_SECRET` or `COOKIE_SECURE=false` | `production` |
| `DATABASE_URL` | Managed Postgres. `postgres://` and `postgresql://` are accepted and rewritten to the `psycopg` driver | `postgresql://user:password@host:5432/db` |
| `JWT_SECRET` | Signs the auth cookie; at least 32 characters, never the development default | output of `openssl rand -hex 32` |
| `COOKIE_SECURE` | Must be `true` (cookie only over HTTPS) | `true` |
| `TRUSTED_PROXY_COUNT` | Reverse proxies in front of the app, so the rate limiter sees the real client IP | `3` on Render (Cloudflare + Render load balancer, see [`operations/rate-limit-diagnosis.md`](operations/rate-limit-diagnosis.md)) |
| `PORT` | Port the container listens on (Render sets it) | `8000` |

Optional: `ACCESS_TOKEN_DAYS`, `RATE_LIMIT_LOGIN_ATTEMPTS`, `RATE_LIMIT_REGISTER_ATTEMPTS`, `RATE_LIMIT_WINDOW_SECONDS` (see [`tech-spec.md`](tech-spec.md) §10). Generate a secret with `openssl rand -hex 32`.

## Deploy on Render (from scratch)

The steps that need your account are manual:

1. Push the repository to GitHub (the Blueprint is `render.yaml` at the repo root).
2. In Render: **New > Blueprint**, connect the GitHub repository and pick the branch to deploy (normally `main`).
3. Render reads `render.yaml`, creates the `personaldolar-db` Postgres and the `personaldolar` web service, generates `JWT_SECRET` and wires `DATABASE_URL` from the database. Review the plan (both `free`) and click **Apply**.
4. Wait for the first build (it builds the Dockerfile, a few minutes). Open the service URL (`https://<name>.onrender.com`); `GET /api/health` must return `{"status":"ok"}`.
5. Record the URL in the README and run the smoke test below.

Do not scale beyond one instance: the login rate limiter keeps its counters in process memory. `TRUSTED_PROXY_COUNT` is `3` on Render because the request arrives as `X-Forwarded-For: <client>, <Cloudflare>, <Render load balancer>`; if the number of hops changes, adjust it (see `operations/rate-limit-diagnosis.md`).

## Migrations, redeploy and rollback

- Migrations: the container entrypoint runs `alembic upgrade head` on every start, so each deploy brings the schema to head before serving.
- Redeploy: a push to `main` deploys automatically once all tests pass (see Continuous deployment below; auto-deploy is off in the Blueprint, the deploy hook is the only trigger). If CD fails or is not set up, use **Manual Deploy** in the Render dashboard, or restart the service.
- Roll back code: in the Render dashboard open **Events/Deploys**, pick an earlier successful deploy and choose **Rollback**. Migrations are not reverted automatically; if a bad migration was applied, run `alembic downgrade <revision>` against the database (Render **Shell** on the service, or `psql` / a local `DATABASE_URL`) before or after rolling back.

## Continuous deployment

The `deploy` job of [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs only on pushes to `main`, and only after `backend`, `frontend`, `backend-postgres`, `docker`, `no-secrets` and `semgrep` (since M9) are all green (it never runs on pull requests). Any test job added later must be added to its `needs` list. The job:

1. calls the Render **deploy hook** (`curl --fail -X POST`), and
2. polls `<RENDER_PUBLIC_URL>/api/health` (after a 30 s head start, every 15 s) until it returns HTTP 200 **and** its `commit` equals the pushed commit SHA (`github.sha`), failing after about 10 minutes.

`/api/health` reports the commit the service is running (`{"status":"ok","database":"ok","commit":"<sha>"}`), read from Render's default environment variable `RENDER_GIT_COMMIT` ([Render docs](https://render.com/docs/environment-variables)); it is `unknown` when the variable is unset or blank (local runs). Render keeps serving the old version while the new one builds, so the job ignores 200 answers with another commit: green means the pushed commit is live. To see what is live, run `curl <RENDER_PUBLIC_URL>/api/health`. If the deploy fails the job times out red. Deploys are serialised (one at a time) and a running deploy is never cancelled. Rollback stays manual (see above).

Setup (you, not the CI):

1. Render dashboard: `personaldolar` service > **Settings > Deploy Hook**, copy the URL.
2. GitHub: **Settings > Secrets and variables > Actions > Secrets** > new secret `RENDER_DEPLOY_HOOK` = that URL. The URL grants deploy rights: never put it in the repo, an issue or a chat.
3. Same page, **Variables** tab > new variable `RENDER_PUBLIC_URL` = the service URL (`https://<name>.onrender.com`; a trailing slash is tolerated). It is not a secret.
4. After the first push to `main`, check that the `deploy` job is green.
5. Rotating the hook (e.g. if it leaked): regenerate it in Render and update the secret.

Known limitation: two merges to `main` in quick succession can make the first `deploy` job fail by timeout. The jobs are serialised, and the first deploy hook may be superseded by the second, so Render never reports the first commit and the job waits in vain for its SHA. The second job still turns green once its own commit is live, so check that one (and `curl <RENDER_PUBLIC_URL>/api/health`) before re-running anything.

If the secret or the variable is missing the job fails with an `::error::` message that does not print any secret.

## Free-tier limits and backups

Limits of Render's free plan, as listed at <https://render.com/docs/free> (checked on 2026-10-20; free tiers change, so re-check before relying on them):

- **Spin-down:** the free web service spins down after 15 minutes without traffic; the next request has a cold start of about a minute.
- **Instance hours:** 750 free instance hours per month per workspace.
- **Single instance:** the free web service runs one instance only (no scaling).
- **Free Postgres:** 1 GB, **no backups**, and it **expires 30 days after creation**; after that there are 14 days of grace before it is deleted with its data. `personaldolar-db` was created on 2026-10-19, so it expires around **2026-11-18** and would be deleted around **2026-12-02** unless it is upgraded or its data moved first. The fallback is a free [Neon](https://neon.tech) Postgres: create a project, copy its connection string into `DATABASE_URL` on the web service (and drop the `databases` block of `render.yaml`).
- Back up by hand with `pg_dump "$DATABASE_URL" > backup.sql` (use the database's external connection string) and restore with `psql "$DATABASE_URL" < backup.sql`. Keep dumps out of the repository (they contain personal financial data).

## Smoke test (run once against the public URL, with a throwaway account)

- [ ] `GET /api/health` returns 200 over HTTPS; plain `http://` redirects to HTTPS.
- [ ] Sign up a new user; the default categories are present.
- [ ] Create a transaction (an income with gross and net salary).
- [ ] Create an investment and update its current value.
- [ ] The dashboard shows the figures.
- [ ] The simulator runs Mode A, B and C and shows the "not financial advice" disclaimer.
- [ ] Log out and log in again.
- [ ] Reload on a deep link (`/investments`): the page loads.
- [ ] In the browser dev tools the `access_token` cookie is `HttpOnly; Secure; SameSite=Lax`.
- [ ] Repeated wrong logins eventually return 429 (rate limit works behind the proxy).

## No secrets in the repo

`.env` and `*.db` are git-ignored. `python3 backend/scripts/check_no_secrets.py` (run by the `no-secrets` CI job) fails if a tracked file is an `.env`/database/key file or contains a private key, a token or a database URL with real credentials.

## Local production-like run (Docker Compose)

`docker-compose.yml` runs the production-like image (root `Dockerfile`) with Postgres 17, for local use only:

```bash
docker compose up --build        # then open http://localhost:8000
APP_PORT=8010 docker compose up --build   # use another host port (http://localhost:8010)
docker compose down              # stop, keep the data (named volume pgdata)
docker compose down -v           # stop and delete the DB volume (full reset)
```

The app waits for the `db` healthcheck, then the entrypoint applies migrations. The DB port is not published, and the app port is bound to `127.0.0.1` only (not reachable from other machines on the network, because the file uses a public dev `JWT_SECRET`). Compose serves plain `http://localhost`, so it sets `ENVIRONMENT=development` and `COOKIE_SECURE=false`: with `ENVIRONMENT=production` the app refuses to start without `COOKIE_SECURE=true` and a strong `JWT_SECRET`, and a `Secure` cookie would not be accepted over http, so login would not work. The credentials and the `dev-only` `JWT_SECRET` in the file are throwaway examples for local use only; this file is not the production deployment (see the rest of this document).
