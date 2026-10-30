# Access logging and anomaly detection

No new persistent access logging is enabled by this branch. Use structured, allowlisted events: timestamp, generated request ID, normalized route template (not URL/query), method, status, duration bucket, fixed auth outcome, rate-limit outcome, deployment ID and dependency version. Never log request bodies, prompts, model answers, birth information, coordinates, email, cookies, authorization headers, tokens, connection strings or raw provider/Prisma errors. Do not log dynamic path segments containing user identifiers. Current legacy `console.error(error)` calls still need a separate redaction sweep; the hardened endpoints suppress their raw errors and `toResponseMessage` always returns a public fallback.

Restrict dashboard and log-drain access to responders; use short retention (propose 14 days for operational events, 30 for security events), encrypted storage and audited exports. Confirm existing platform logs do not capture sensitive query strings; configure redaction before enabling broader collection. A report-only CSP has no report endpoint here, so violations are visible in browser developer tools only. Adding a collector requires stripping document URLs/query strings and avoiding script samples.

Start alerts in observation mode and tune against normal traffic:

- Repeated 401/403 or cross-origin rejections; sudden increase in requests to admin, OAuth, or private MCP routes.
- Sustained 429s, cold starts, CPU timeouts, elevated 5xx or concurrent expensive calculation requests.
- Unexpected provider spending/reservation failures, grant revocations, login bursts and service-key use from unfamiliar infrastructure.
- Unexpected changes to RLS, policies, role grants, exposed schemas, storage bucket visibility, deployments or environment configuration.
- Dependencies re-entering vulnerable ranges; run `npm ci` and `npm audit` in CI with the committed npm lockfile.

Alert payloads should include aggregate counts and request IDs only. Investigate through restricted dashboards; do not paste credential-bearing logs into issues or chat.

## Vercel settings for owner review

The request identifies Vercel, while repository deployment comments/workflows also reference Cloud Run. Confirm the actual production edge and direct-origin exposure before applying platform-specific rules. Nothing was changed remotely.

1. Enable managed WAF protections and bot rules in log mode first. Review false positives before challenge/block mode. Use [Vercel Firewall](https://vercel.com/docs/vercel-firewall) and [Bot Management](https://vercel.com/docs/bot-management).
2. Configure distributed rate limits for public MCP, contact, expensive searches and AI/voice routes. Start near application limits, measure real client bursts, then tune. The in-memory `requestLimiter` resets on restart and multiplies across instances; it is only a backstop. Keep existing private MCP/voice durable budgets.
3. Public MCP and OAuth are machine protocols: do not apply browser challenges to them. Exempt legitimate cron/webhook integrations from browser challenges while retaining their own secrets/signatures and quotas. Do not grant a blanket WAF bypass to a caller-controlled header. Keep robots, sitemap and legitimate search indexing functional.
4. Validate which forwarding header the platform overwrites, and block direct-origin traffic. `clientKey` currently understands Cloud Run's forwarded chain; spoofable addresses must never be the only limiter. Every added limiter has a process-wide ceiling as well.
5. Set provider spending caps and alerts outside application code. Protect preview deployments containing real data; scope production credentials to production. Review team MFA, least privilege, deployment approvals and firewall configuration changes.
6. Use [Firewall Observability](https://vercel.com/docs/vercel-firewall/firewall-observability) and restricted log drains. Confirm what each export contains and redact it before widening access.

The headers enforce HSTS for the current host (no preload/subdomain commitment), no framing, no MIME sniffing, and restrictive object/base URI behavior. Scripts/styles remain report-only until maps, OAuth, voice, media, KaTeX and Next inline bootstrapping have been tested. Roll out a nonce/hash-based enforcing script policy after collecting a minimal allowed-source inventory. Microphone and geolocation remain same-origin to preserve existing features.
