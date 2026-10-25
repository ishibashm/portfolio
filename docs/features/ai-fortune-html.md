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

AI output is HTML + CSS only; CSS animations and transitions are allowed.
It renders only in a srcdoc iframe with `sandbox=""` (no scripts or same-origin
access). A CSP meta is the first head element:
`default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'`.
The parse5 sanitizer removes all scripts, event handlers, metadata, base/link,
iframe/object/embed/form, foreign namespaces and all href/src URL attributes,
including javascript: and data: URLs. CSS blocks and style attributes containing
@import, any url(), expression() or behavior are discarded entirely. CSS escapes
and control characters are also rejected, and comments are removed before checks.
The iframe uses a responsive 70vh height with a 480px minimum and document scrolling;
there is no postMessage listener or injected sizing script. CSS is isolated from
the rest of the site by the iframe document boundary.

Static AI text remains restricted to fixed headings and exactly one placeholder per
complete MCP fact. Missing, repeated, altered or invented facts trigger the local
fallback. CSS can affect the presentation of validated text. The authoritative
server-rendered MCP key-values block therefore always appears OUTSIDE the iframe. No AI markup enters the parent
DOM. The deterministic non-AI template remains visible if generation fails.

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
