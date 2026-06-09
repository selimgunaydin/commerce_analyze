# Entysa E-Commerce Audit

Entysa E-Commerce Audit is a local-first ecommerce audit system. It crawls a target site with a real browser, captures desktop and mobile screenshots, extracts page evidence, runs deterministic ecommerce detectors, collects Lighthouse and axe accessibility data, compares manually supplied competitors, generates implementation-ready opportunities, and writes a final report.

The current implementation covers roadmap phases 1-12. Phase 13 future extensions are intentionally not implemented.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript strict mode
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Playwright Chromium
- Lighthouse
- axe-core/playwright
- Zod validated AI output
- OpenAI-compatible chat completions provider with local structured fallback

## What The Platform Does

1. Creates an audit project from a validated public URL.
2. Enqueues a BullMQ audit job.
3. Crawls the homepage and selected internal PLP/PDP/search/campaign pages based on audit depth.
4. Captures desktop and mobile screenshots.
5. Extracts title, meta description, visible text, headings, links, buttons, forms, console errors, failed requests, images, and scripts.
6. Runs deterministic homepage, PLP, PDP, and technical detectors.
7. Runs Lighthouse mobile audits and axe accessibility scans.
8. Crawls manually entered competitor homepages.
9. Produces deterministic scorecards.
10. Runs structured AI agents for site profile, page UX analysis, competitor comparison, opportunity generation, and final report writing.
11. Stores opportunities as DB records.
12. Stores final report JSON and Markdown in `AuditReport`.
13. Displays dashboard, audit details, opportunities, competitor comparison, screenshots, and final report UI.

## Roadmap Coverage

- Phase 1: foundation, API routes, queue, worker, dashboard, URL validation.
- Phase 2: Playwright crawler, screenshots, DOM extraction, storage provider.
- Phase 3: internal link discovery, page classification, depth-limited crawling.
- Phase 4: deterministic ecommerce and technical detectors.
- Phase 5: Lighthouse and axe accessibility audits with partial failure behavior.
- Phase 6: manual competitor analysis.
- Phase 7: deterministic project and page-level scoring.
- Phase 8: OpenAI-compatible provider, Zod schemas, repair prompts, site/page AI agents.
- Phase 9: competitor comparison agent.
- Phase 10: opportunity generator agent, opportunity DB model, opportunity UI.
- Phase 11: final report writer, final report JSON/Markdown, `/audits/[id]/report` UI.
- Phase 12: hardening, rate limiting, retry/idempotency, storage cleanup, AI input guards, screenshot size guards, tests, deployment notes.

## Requirements

- Node.js 20+
- pnpm
- Docker Desktop or another Docker daemon
- PostgreSQL
- Redis
- Playwright browser binaries

## Quick Start

Install dependencies:

```bash
pnpm install
```

Install Playwright Chromium:

```bash
pnpm exec playwright install chromium
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Apply Prisma migrations:

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/commerce_analyze?schema=public" pnpm exec prisma migrate deploy
```

Generate Prisma client:

```bash
pnpm prisma:generate
```

Start the web app:

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/commerce_analyze?schema=public" REDIS_URL="redis://localhost:6379" pnpm dev
```

Start the worker in another terminal:

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/commerce_analyze?schema=public" REDIS_URL="redis://localhost:6379" pnpm worker
```

Open:

```txt
http://localhost:3000/audits
```

## Environment Variables

See `.env.example` for defaults.

Core:

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis connection string.
- `AUDIT_STATUS_STEP_DELAY_MS`: small worker pacing delay.

Crawler and storage:

- `CRAWLER_TIMEOUT_MS`: Playwright navigation timeout.
- `CRAWLER_MAX_TEXT_LENGTH`: visible text truncation limit during extraction.
- `CRAWLER_MAX_PAGES`: hard cap enforced by worker.
- `CRAWLER_MAX_REDIRECTS`: max allowed redirect chain length.
- `LOCAL_STORAGE_ROOT`: local file root for screenshots.
- `LOCAL_STORAGE_PUBLIC_URL_PREFIX`: public URL prefix for stored files.
- `SCREENSHOT_MAX_BYTES`: screenshot byte-size guard.

Technical audits:

- `LIGHTHOUSE_TIMEOUT_MS`: Lighthouse execution timeout.
- `ACCESSIBILITY_TIMEOUT_MS`: axe accessibility timeout.

AI:

- `OPENAI_API_KEY`: leave empty to use local structured fallback.
- `OPENAI_BASE_URL`: OpenAI-compatible API base URL.
- `OPENAI_MODEL`: chat model name.
- `AI_TIMEOUT_MS`: provider timeout.
- `AI_MAX_PROMPT_CHARS`: cost guard for full prompt JSON.
- `AI_MAX_STRING_CHARS`: max string length inside AI payloads.
- `AI_MAX_ARRAY_ITEMS`: max array length inside AI payloads.

Production guards:

- `RATE_LIMIT_WINDOW_MS`: rate-limit window.
- `AUDIT_CREATE_RATE_LIMIT_MAX`: max audit creates per client/window.
- `AUDIT_START_RATE_LIMIT_MAX`: max audit starts per client/window.
- `ADMIN_API_KEY`: optional guard for future admin-only internal endpoints. No admin endpoints are exposed by default.

## Running An Audit

1. Go to `/audits/new`.
2. Enter a public `http` or `https` URL.
3. Optionally enter brand, industry, country, and up to 3 manual competitor URLs.
4. Select depth:
   - `QUICK`: homepage only.
   - `STANDARD`: homepage, up to 1 PLP, up to 1 PDP.
   - `DEEP`: homepage, up to 3 PLP, 3 PDP, 1 search, 2 campaign pages.
5. Submit the form.
6. Keep the worker running until status is `REPORT_READY`.
7. View audit details at `/audits/[id]`.
8. View the final report at `/audits/[id]/report`.

## API Routes

- `POST /api/audits`: create an audit project.
- `GET /api/audits`: list recent audits.
- `GET /api/audits/[id]`: fetch audit details, pages, competitors, reports, and opportunities.
- `POST /api/audits/[id]/start`: enqueue or rerun an audit.

## Worker Pipeline

The worker is defined in `workers/dummy-worker.ts`.

Current job flow:

1. Mark audit `CRAWLING`.
2. Clear old pages, reports, opportunities, and local audit screenshots for reruns.
3. Crawl homepage.
4. Discover and crawl depth-limited candidate pages.
5. Mark audit `AUDITING`.
6. Run Lighthouse and axe for customer pages.
7. Analyze manual competitors when present.
8. Create deterministic scorecard and page scores.
9. Mark audit `AI_ANALYSIS`.
10. Run site profile and page UX agents.
11. Run competitor comparison when competitors exist.
12. Generate opportunities and store them in `Opportunity`.
13. Write final report JSON and Markdown to `AuditReport`.
14. Mark audit `REPORT_READY`.

## Security Notes

URL validation blocks:

- unsupported protocols
- localhost
- private IPv4 ranges
- private IPv6 ranges
- link-local addresses
- metadata IP ranges such as `169.254.169.254`
- common internal host suffixes
- DNS targets that resolve to private/internal addresses

Crawler hardening:

- redirects are validated again after navigation
- redirect chain length is capped
- page count is capped by depth and `CRAWLER_MAX_PAGES`
- browser contexts and browsers are closed in `finally` blocks
- screenshot byte size is capped with JPEG/viewport fallback

API hardening:

- `POST /api/audits` is rate limited
- `POST /api/audits/[id]/start` is rate limited
- start route supports reruns and worker idempotency clears stale output

Worker hardening:

- BullMQ retries jobs with exponential backoff
- competitor failures do not fail the whole audit
- discovered page failures do not fail the whole audit
- Lighthouse/axe failures are stored as JSON error objects where possible
- per-page AI failures are stored as error JSON and do not fail the whole audit

AI hardening:

- all AI outputs are Zod validated
- invalid JSON can be repaired and retried
- local structured fallback works when no provider key is configured
- prompt payloads are truncated by string, array, and full prompt limits
- final report writer preserves stored opportunity lists

## Tests

Run:

```bash
pnpm test
```

The minimum Phase 12 test set covers:

- URL validation
- URL normalization
- page classifier and discovery
- detector engine
- scoring engine
- opportunity schema validation

Run typecheck:

```bash
pnpm typecheck
```

Run production build:

```bash
pnpm build
```

## Known Limits

- Competitors are manual only, max 3 per audit.
- Competitor crawling is homepage-only.
- No PDF export is implemented.
- No multi-tenant authentication is implemented.
- No automatic competitor discovery is implemented.
- AI fallback output is deterministic and useful for development, but real report prose improves with an OpenAI-compatible provider key.
- Local in-memory rate limiting resets when the Next.js process restarts.
- Local screenshot storage is intended for development and single-node deployments.

## Deployment Notes

- Use managed PostgreSQL and Redis in production.
- Run the web app and worker as separate processes.
- Use `prisma migrate deploy` during deployment.
- Persist `LOCAL_STORAGE_ROOT` or replace local storage with an object-storage-backed provider.
- Set `OPENAI_API_KEY` only in server-side environment variables.
- Set conservative crawler, Lighthouse, accessibility, and AI timeouts.
- Put the app behind a reverse proxy that forwards real client IP headers if rate limiting is expected to be meaningful.
- Monitor worker failures and BullMQ queue depth.
- Keep Playwright browser dependencies available in the worker image.

## Useful Commands

```bash
pnpm install
pnpm exec playwright install chromium
docker compose up -d postgres redis
pnpm prisma:generate
pnpm typecheck
pnpm test
pnpm build
pnpm dev
pnpm worker
```
