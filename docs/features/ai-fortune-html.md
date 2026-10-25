# AI decorated fortune report

`/relocation/dashboard` includes an authenticated server component under Suspense.
`AI_FORTUNE_HTML_ENABLED=true` enables it; otherwise the section is absent, with
no authentication lookup or model request. No chat UI or user-supplied prompt exists.
Missing/invalid registered birth date or departure coordinates shows only `/profile`.
The component uses the verified user's `user_configs` values, never client inputs.

Public MCP `judge_directions` and `judge_time_slots` calculation functions run
in-process for the JST day. Their default settings are used (classical time board).
This daily report does not follow the dashboard's temporary date/filter controls.
Gemini's required tool call retrieves those calculated facts; the second step
arranges them into HTML. Birth date, coordinates, email, and user ID are not sent
to Gemini. Computed direction/time facts are sent when model generation is enabled.

The parse5-based sanitizer reconstructs only allowed HTML tags and five exact
`fortune-*` classes. All other attributes and foreign/unknown element subtrees are
removed. AI text is restricted to fixed headings and one placeholder per complete
label/value fact. The server rejects missing, repeated, altered, or invented facts,
injects escaped MCP values, then sanitizes again before `dangerouslySetInnerHTML`.
The deterministic template uses the same facts and sanitizer.

The model is fixed to `gemini-2.5-flash-lite`, using the shared agent Google key
resolver (`GOOGLE_GENERATIVE_AI_API_KEY || GEMINI_API_KEY`). Chat provider/model
settings cannot redirect this feature. Existing `PAID_APIS_DISABLED` remains a
kill switch: true/unset produces the local template. No billing settings are
changed. Use an **unbilled free-tier Google AI Studio project**: Google offers no
per-request switch to force a billed project's key onto the free tier.

The process-local cache keys include user ID, all profile inputs, and JST day
(hashed, never logged). Concurrent identical requests share one promise; failures
are cached too. Limits are 20 generations globally and 2 per user per JST day,
with at most two model steps per generation, zero retries, and a 12-second abort.
No key, quota errors, timeout, or invalid HTML uses the deterministic template.
Calculation/storage failure displays an unavailable message rather than invented
values. Cache and limits reset on process restart and are independent per replica;
they are not a distributed quota guarantee. No paid fallback exists.

Verification: Vitest covers sanitization, value consistency, local fallback,
provider/flag/kill-switch gating, SDK timeout and no retries, concurrent caching,
profile/user/day isolation, both rate limits, and authenticated component behavior.
Tests use fake keys and mock SDK responses; no live model calls are needed.
