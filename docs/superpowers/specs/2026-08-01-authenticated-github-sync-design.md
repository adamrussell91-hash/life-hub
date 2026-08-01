# Authenticated GitHub Sync Design

Date: 1 August 2026  
Status: Approved  
Phase: 3 of the Life Hub delivery roadmap

## Outcome

Life Hub becomes a private, single-user application that signs Adam in with one passphrase and renders the Home dashboard from live Markdown files in the private GitHub repository. The browser receives only allowlisted content through same-origin Netlify Functions. It never receives the GitHub token, passphrase verifier, session secret, provider error details, or unrestricted repository access.

This phase remains read-only. It creates the authenticated server boundary, live repository discovery, incremental refresh, and health reporting required by later chat and write phases.

## Scope

This phase includes:

- a focused sign-in view and authenticated application gate;
- passphrase verification against a salted scrypt verifier;
- signed, short-lived session cookies;
- logout and session-expiry handling;
- Netlify function routes for session, repository manifest, repository files, and provider health;
- platform rate limiting for authentication attempts;
- read-only, allowlisted access to Life Hub data and configuration in GitHub;
- branch and blob SHA metadata for incremental refresh;
- browser caching of the last successful manifest and file responses;
- automatic two-minute change checks and manual refresh;
- GitHub token-expiry warnings within fourteen days;
- a fixture-backed local development adapter and fully mocked provider tests;
- symbolic environment documentation and deployment readiness checks.

It excludes chat, Anthropic calls, GitHub writes, Day One, Resend, domain detail pages, account management, password reset, multi-user roles, offline writes, production credentials, and production promotion.

## Deployment and runtime

Netlify serves the existing static PWA and same-origin functions. Public browser routes use stable `/api/*` paths mapped directly by each function's exported Netlify configuration:

- `POST /api/auth` validates a passphrase and creates a session.
- `GET /api/session` reports whether the current cookie is valid.
- `POST /api/logout` expires the session cookie.
- `GET /api/repo/manifest?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a range-specific manifest identifier plus allowlisted path, blob SHA, and size metadata for the requested Sydney date range and required configuration files.
- `POST /api/repo/files` accepts a bounded list of exact `{ path, sha }` pairs from the current manifest and returns their UTF-8 content.
- `GET /api/health` reports sanitized GitHub availability and credential-expiry state.

Function modules use the Fetch `Request` and `Response` contract and keep platform adapters thin. Authentication, GitHub access, filtering, response shaping, and caching remain ordinary JavaScript modules that can be tested without a deployed site.

## Authentication and sessions

The app is deliberately single-user. `LIFE_HUB_PASSPHRASE_HASH` contains a versioned scrypt verifier with a random salt. The raw passphrase exists only in the incoming authentication request and is never stored or logged. Verification derives a fixed-length candidate and uses constant-time comparison.

Successful authentication creates an eight-hour session containing only a version, issued time, expiry time, and random session identifier. The compact payload is authenticated with HMAC-SHA-256 using `SESSION_SECRET`. The cookie is named `life_hub_session` and uses `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and an eight-hour `Max-Age`. Invalid, malformed, expired, or incorrectly signed cookies are rejected and cleared.

Authentication accepts JSON only, enforces a small request-body limit, rejects cross-origin requests, and returns generic errors. The auth function declares a Netlify code-based rate limit of five attempts per sixty seconds per domain and IP. Rate limiting lives in the function's exported configuration because current Netlify functions do not accept those rules from `netlify.toml`.

The sign-in form has a visible label, password-manager-compatible field, progress state, generic invalid-credentials message, and accessible focus handling. It never writes the passphrase to local storage, session storage, a URL, or application logs.

## Repository boundary

Production repository configuration is server-only:

- `GITHUB_REPOSITORY=adamrussell91-hash/life-hub`
- `GITHUB_BRANCH=main`
- `GITHUB_TOKEN`
- `GITHUB_TOKEN_EXPIRES=YYYY-MM-DD`

The fine-grained GitHub token requires read-only Contents permission for this one private repository. GitHub requests use the current versioned REST API header and identify Life Hub with a stable user agent.

The manifest service resolves the configured branch to a commit and recursive Git tree. It rejects truncated trees rather than silently returning incomplete data. The server exposes only blobs matching these rules:

- `data/<approved-domain>/**/YYYY/MM/YYYY-MM-DD-*.md` when the canonical event date falls inside the validated requested range;
- `config/targets.yml`;
- `config/agents.yml`;
- `central-node.md` only when a future view explicitly requests it; it is not part of the Home manifest.

Approved event domains are `nutrition`, `fitness`, `body`, `mind`, and `skincare`. Paths are normalized as repository-relative POSIX paths. Empty segments, backslashes, URLs, dot segments, control characters, unsupported extensions, and paths outside the allowlist are rejected.

The file endpoint accepts at most fifty entries and a bounded total declared size. Every requested path and blob SHA must appear together in the current server-issued manifest. The server fetches blobs by SHA, verifies GitHub's response encoding, decodes UTF-8 content, enforces the actual size limit, and returns only `{ path, sha, content }`. GitHub URLs, headers, tokens, rate-limit details, and raw provider errors never reach the browser.

## Incremental client sync

On startup the client checks `/api/session`. An unauthenticated response renders sign-in; an authenticated response starts sync.

The Home sync requests the current Sydney date window needed by the view. It initially requests the current day plus the preceding thirty days. If a completed-workout streak reaches the oldest loaded day, the client extends the range backwards in ninety-day blocks until it finds a non-workout day or reaches the first repository event. This preserves exact streaks without downloading all history for ordinary loads. The manifest response contains the branch commit SHA, a `manifestId` derived from the commit and exact range, and file metadata. Conditional requests use `manifestId`, so a wider range at the same commit cannot incorrectly receive `304 Not Modified`. The client compares each `{ path, sha }` with its last successful cache, requests only missing or changed files in batches of at most fifty and 1 MiB, parses all available documents through the existing production parser, and derives the Home model through the existing target and aggregation modules.

The cache stores no credentials. It contains only sanitized API responses already authorized for the browser. A successful sync replaces the manifest atomically after all changed files have been received and validated. If changed content is invalid, the prior valid file remains readable and the UI reports a completeness warning. Explicit logout clears the private repository cache and the tab's authenticated-session marker.

The client checks the manifest every two minutes while the page is visible and on manual refresh. Identical branch and manifest identifiers perform no file downloads or re-render. Concurrent refreshes collapse to one active request. A newly authenticated load uses today's `Australia/Sydney` date rather than the greatest fixture date.

Local development uses the same browser sync interface with mock `/api/*` routes backed by checked-in fixtures. Production behavior is never enabled by a browser flag, query parameter, or committed secret.

## Health and failure behavior

`/api/health` authenticates the session and checks the configured repository by resolving the branch. Successful results may be cached server-side for up to one minute. It reports only:

- `github: healthy | unavailable | misconfigured`;
- `token: healthy | expiring | expired | unknown`;
- the expiry date when configured;
- a stable, friendly code and retryability flag.

The token becomes `expiring` fourteen Sydney calendar days before `GITHUB_TOKEN_EXPIRES`. Provider failures use generic client messages and structured server-side error classes without tokens or private content.

Failure behavior is recoverable:

- invalid credentials keep the user on sign-in with a generic message;
- expired sessions return to sign-in without erasing cached read data;
- GitHub failures retain the last successful Home view and show a retry action;
- offline mode in a tab that completed online authentication retains cached read data and disables refresh until the signed session's known expiry; a new tab or expired marker requires online sign-in;
- malformed files are skipped or replaced by their last valid cached version with a visible completeness warning;
- missing initial data renders the existing unavailable state.

## Interface changes

The Clinical Glass shell gains:

- a full-page sign-in card before authenticated content is revealed;
- a hidden-by-default account menu with sign-out;
- a manual refresh control and last-success time;
- a provider-status notice only for GitHub failure or token expiry;
- clear `loading`, `refreshing`, `stale`, `offline`, and `signed-out` states.

The Home layout, values, navigation behavior, and responsive desktop/mobile structure otherwise remain unchanged. Sign-in and status interactions meet the existing 44-pixel touch target and 390-pixel no-overflow requirements.

## Environment contract

`.env.example` documents names and safe placeholders only:

- `LIFE_HUB_PASSPHRASE_HASH`
- `SESSION_SECRET`
- `GITHUB_REPOSITORY`
- `GITHUB_BRANCH`
- `GITHUB_TOKEN`
- `GITHUB_TOKEN_EXPIRES`

A local script generates the passphrase verifier and a separate random session secret without echoing the raw passphrase. Documentation explains Netlify environment setup but no production value is required during this phase.

## Verification

Unit tests cover verifier parsing, scrypt comparison, HMAC session creation and expiry, cookie attributes, origin and body validation, repository configuration, canonical allowlisting, date-range filtering, manifest/file request limits, blob decoding, cache diffs, Sydney refresh windows, expiry warnings, and secret-safe error mapping.

Integration tests invoke function handlers with mocked GitHub responses and cover sign-in, session validation, logout, unauthenticated rejection, manifest discovery, unchanged manifests, changed-file retrieval, truncated trees, GitHub failures, malformed blobs, and health states. Tests never call the production repository.

Browser acceptance covers successful and rejected sign-in, authenticated desktop and 390-pixel Home views, manual refresh, session expiry, sign-out, live-data warnings, cached GitHub failure, and offline reload. Security checks scan browser assets, function responses, fixtures, source maps, and repository files for secret values.

## Definition of done

Phase 3 is complete when an authenticated browser can render Home from a mocked private-repository contract, fetch only changed files on refresh, recover safely from session and provider failures, and expose no secret or unrestricted repository capability. All unit, integration, browser, fixture, dependency, whitespace, and secret checks pass. The implementation is then published as a draft pull request while production credentials remain disconnected.

## References

- [Netlify Functions API](https://docs.netlify.com/build/functions/api/)
- [Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)
- [GitHub Git Trees REST API](https://docs.github.com/en/rest/git/trees)
