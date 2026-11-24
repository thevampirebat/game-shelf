# Validation — International v0.3.0 beta

Passed: `node --test tests/*.test.cjs` — 11 test files.

New coverage:
- Fresh installations have zero visible stores; migration preserves older stores.
- Built-in/custom store activation through the same message used by the popup.
- Once/twice daily, once/twice weekly, custom weekdays, manual mode, future starting dates and invalid dates/times.
- Schedule alarms are created or cleared correctly; local-calendar tests also run with Europe/Dublin timezone.
- Reference-rate response validation and inversion, source-date expiry, explicit overrides, manual mode, cached-rate retention on network failure and changing the base during an in-flight fetch.
- Persistent product sorting, creation dates, categories and settings across backup/import.

Existing tests continue covering price parsing/picking, Amazon split/accessibility prices, regional routing, notification thresholds, scan-window cleanup, failed/blocked reads, multi-listing storage and history preservation.

All shipped JavaScript passes Node syntax checking. Popup/dashboard selector IDs, unique HTML IDs and local dependencies checked. The rate parser is based on the current Frankfurter v2 OpenAPI schema (https://api.frankfurter.dev/v2/openapi.json); network behavior is tested with deterministic responses and errors, not claimed as a live service availability check.

No browser executable is available in this environment. Visual rendering, Firefox popup sizing at different display scales, permissions prompts and live store checks have not been validated here. The source includes the legacy browser reader fixture page for additional manual testing. This is an unsigned beta, not a production-signed release.

## v0.3.1

Popup-only sizing correction: removed root vw/vh limits and added explicit root/body dimensions. Verified packaged CSS and version references. Live Firefox visual verification remains outstanding.

## v0.4.0

12 automated test files pass. Additional tests exercise permission-grant completion without a surviving popup, cancelled requests, duplicate prevention, increase-alert suppression with retained history, theme backup/restore, backup permission and path validation, file completion, concurrent download prevention and download failures. HTML IDs/dependencies and JavaScript syntax checked. No live Firefox UI or Google Drive desktop sync verification is claimed.

## v0.4.1
Dashboard syntax and tile-theme validation/backup restoration checked. Surface styling uses independent tile foreground colours. Live Firefox visual verification remains outstanding.

## v0.5.0
13 test files pass, including exact-target eligibility, no repeated alerts, rearming, failed readings, notification mute, conversion availability and backup restoration. Live Firefox notification/UI verification remains outstanding.

## v0.5.1
The actual scheduleFromForm function passes a targeted regression check with multiple days, zero days, daily/twice-daily/manual modes and a non-iterable array-like DOM collection. Dashboard syntax check passed.

## v0.5.2
15 Node test files pass. Regression coverage exercises synchronous click-gesture permission requests, selected-game scope, denial without scanning, manual background preflight, and automatic missing-access failure without creating a window. Window cleanup and creation-failure price retention remain covered. Live Firefox/store verification remains outstanding; missing permissions are a likely cause of the reported immediate window closure, not confirmed against the user’s browser.

## v0.5.3
All 17 Node test files pass. Added a fixture from the live Very Killing Floor 3 page fetched 2026-09-26: automatic and manually picked current price both produce EUR 17.99; prior price and saving selections are rejected. Non-sale headings and ambiguous amounts are covered. Timer tests exercise early polling, unchanged successful-price settling, changing prices, delayed readings, timeout, blocked exit and tab cleanup. JavaScript syntax checks pass. Orange error styling overrides custom tile colours and includes text; live Firefox visual testing and a full 145-listing timing benchmark remain outstanding.

## v0.6.0
All 19 Node test files pass. New model/integration coverage exercises summary versus individual delivery, mute and no-change suppression, target-alert grouping and failed-notification rearming, pause/resume, scoped failed-only retries, successful and persistent-error retry limits, blocked-store suppression, explicit stock transitions across intervening failures, delivery validation and ranking, mixed-currency history grouping, variant warnings, and backup retention of new settings. Dashboard ID references and all JavaScript syntax checked. Live Firefox notifications, visual chart/layout QA and full scheduled-store runs remain outstanding; no browser binary is available in this workspace.

## v0.6.1
Product-dialog backdrop dismissal added using pointer-start and click bounds. JavaScript syntax checked; live Firefox interaction remains unverified.

## 1.0.0 release review
See submission kit REVIEW-REPORT.md. All 19 automated test files pass. Mozilla web-ext 10.7.0: zero errors, warnings and notices. Backup concurrency/permission regressions covered; dirty-editor preservation statically reviewed. Live Firefox testing remains outstanding.

## 1.0.1
20 automated test files pass; web-ext 10.7.0 reports zero errors, warnings or notices. Buy New prioritisation uses modeled DOM fixtures, not HTML from the screenshot. Popup delivery persistence is covered for new/existing listings, omitted fields, unknown/free and invalid costs. Live Firefox verification remains outstanding.

## 1.0.2
20 automated test files pass; runtime JavaScript syntax checks pass; Mozilla web-ext 10.7.0 reports zero errors, warnings and notices. Support-link URLs, target and rel attributes checked. Live Firefox visual/click verification remains outstanding.

## 1.0.3
Cosmetic toolbar change only. Mozilla web-ext 10.7.0 reports zero errors, warnings and notices. Support URL and adjacency to Help checked. Runtime JavaScript is unchanged from 1.0.2. Live Firefox layout verification remains outstanding.

## 1.0.4
Popup dimensions and scroll fallback checked; web-ext 10.7.0 reports zero errors, warnings and notices. CSS/metadata changes only. Live Firefox visual verification remains outstanding.

## 1.0.5
All 21 automated test files pass; runtime JavaScript syntax checks pass; web-ext 10.7.0 reports zero errors, warnings and notices. New live-extracted ShopTo Offer fixture covers image picking, product/form identity, currency, updated amounts and ambiguity. Scan failure notices and opt-out/backup retention covered. Live Firefox/Back Market verification testing remains outstanding.

## 1.0.6
Dashboard syntax check passed; web-ext 10.7.0 reports zero errors, warnings and notices. Presentation-only changes distinguish blocked verification tiles and notices from orange read failures/unavailable listings. Live Firefox appearance remains unverified.

## 1.0.7
21 regression files passed. Updated window/timing tests passed for active listing tabs, non-focused default, opted-in foreground creation and subsequent focus/restore, backup preservation, cancellation and cleanup. Syntax checks and web-ext 10.7.0 passed with zero errors, warnings or notices. Live Smyths/Firefox focus behaviour remains unverified.

## 1.0.8
All 22 regression files passed. Summary tests cover identity/current amount, old prices, ties, stale/blocked/paused/hidden exclusions, currency conversion, delivered totals and legacy entries. Background summary metadata checked. Runtime syntax and web-ext 10.7.0 pass with zero errors, warnings and notices. Live Firefox appearance remains unverified.

## v1.0.9 — Out-of-stock duration

Observed unavailability dates persist across scans and backups; confirmed availability clears them. Errors and unknown availability preserve the last confirmed state. Old listings without a date start on their next confirmed unavailable reading. Grid and product menu notes update once per minute without rebuilding editors.

Validation: 23 regression test files passed and all runtime JavaScript syntax checks passed. New coverage includes elapsed-time formatting, repeat scans, error/blocked/unknown preservation, return and restart, legacy listings and backup timestamp validation. Live Firefox UI has not been exercised here.

## v1.0.10 — Sale labels and local store learning

Adds sale-price element normalization and a scoped main-product sale-price fallback. Successful manual picks learn a stable tag/class selector when uniquely matched on the original page. Rules are restricted to exact HTTPS origin, store identity (including region) and currency. Explicit listing selectors and product structured data take priority. Rules require exactly one visible match and one parseable amount. They use local storage and backups with no new permissions, remote code or service.

Automatic checks includes a learning/use toggle, count and clear button. Learning is enabled by default. Disabling preserves saved rules but stops learning/using them. Clearing shared layouts preserves individual listing selectors. Not every pick has a reusable structure; ambiguous ones are not learned.

Validated: 24 Node regression test files and runtime syntax checks passed. Includes fixtures extracted from the supplied Just for Games page fetched 2026-10-06 (Product identity/offers only), manual sale-label parsing, fallback price, local rule generation/reuse, origin/currency guards, ambiguity, backups and background settings/pick/clear behaviour. No live Firefox execution was performed.

## v1.0.11 — Stock detection and preferences

Expands visible Amazon stock-message checks before saved selectors. Explicit matching Product stock data does not require a price. No-featured-offer pages retain old prices, use an explanatory status and do not begin/reset stock streaks. Missing prices without stock evidence remain errors. Blocked-page and variant guards take priority. No-featured-offer scan reads require two consistent observations.

Adds a default-off out-of-stock alert toggle, separate from existing back-in-stock alerts. It notifies on transition only, using the chosen notification style and master switch. Initial additions seed stock state without sending alerts. Themes include an independently configurable out-of-stock background with contrast-selected text; preference validation and backups preserve both new settings.

Validation: all 25 regression test files and runtime JavaScript syntax checks passed. Stock tests cover scoped/hidden/recommendation text, no featured offer versus actual prices, saved-selector failures, variant and CAPTCHA guards, explicit missing-price stock data, stale-price preservation, stock-alert transitions/mute/summary and backup settings. No live Firefox/Amazon execution was performed. The screenshot supplied by the user showed See All Buying Options, not an explicit stock-out message.

## v1.0.12 — Two-axis autoscroll and summary backups

Grid middle-click autoscroll uses horizontal grid movement and vertical window movement, a central dead zone and frame-time-adjusted speed. Interactive targets retain native middle-click behavior. Escape, another click, focus loss, page hide and document visibility changes stop the animation and remove the marker.

Exports already include lastSummary through whole-state JSON. Import now validates and restores it, bounding messages/items and rejecting unsafe price metadata. Listing IDs are remapped by URL because imported listings receive new IDs. Imported prices remain pending; current-lowest highlighting resumes after confirmation. Older backups without a summary remain valid.

All 27 regression test files and runtime syntax checks passed. New tests cover two-axis motion/dead zone/cleanup/interactive exclusions and summary restore/remapping/metadata/legacy backups. No live Firefox UI testing was performed.

## v1.0.13 — Incremental summary persistence

Previous code persisted lastSummary only after a scan finished and only populated its alert queue in summary notification mode. A browser shutdown during a scan could therefore discard an unsaved queue, while individual mode never created a local summary. Normal startup already retained completed saved summaries; ordinary tab unloading deleting one was not reproduced.

Scan notices now enter the local summary queue in both notification styles and each is saved through the serialized storage mutation queue before delivery. In-progress snapshots have a partial/inProgress marker. Startup migration converts an in-progress snapshot into an interrupted partial summary. Finalization saves completed/partial status and only sends the aggregate notification in summary mode. Quiet scans do not overwrite the previous summary. Master notification/threshold preferences still determine matching alerts. Existing backup handling continues to preserve the summary.

All 28 regression test files and runtime syntax checks passed. New lifecycle tests use fresh background contexts with shared persisted storage to cover mid-scan interruption, restart, reloading state, quiet scans, individual mode without duplicate notifications, unrelated settings and backups. This is simulated lifecycle coverage; no live Firefox restart/tab-unload test was performed. Missing unsaved summaries from previous versions cannot be recovered automatically.

## v1.0.14 — ShopTo currency selection

Adds a locally packaged ShopTo currency-link inspector and background preparation for page-complete events and explicit reads. The currency preference comes from an existing saved listing, otherwise its configured store. Only EUR triggers automatic navigation. Requires website access and an enabled store. The target must be ShopTo HTTPS on the exact same origin, recognised product ID and language, with an EUR path. Navigation is bounded to two attempts per tab/product per 90 seconds and per-tab retry state is removed when a tab closes. A late event rechecks the current URL before navigating.

Recognises the same ShopTo product across currency paths for read/update matching and history retention. Saved selectors and IDs remain. Currency-menu and product metadata guards reject GBP values when EUR is configured, including manually picked plain numbers. Actual ShopTo EUR prices are used; no exchange conversion is substituted. Account, checkout and non-product paths are outside the adapter.

All 30 Node regression test files and runtime syntax checks passed. Tests cover observed menu link forms, same-product/origin/language guards, relative links, already-EUR no-op, ordinary page-complete handling, read preparation, saved URL/price history, permissions, explicit GBP overrides, bounded retry, tab cleanup, duplicate matching and GBP/mixed metadata rejection. ShopTo GBP and EUR page HTML was retrieved 2026-10-18 to verify menu behavior. No live Firefox UI or retailer browser-session switching test was performed.

## v1.0.15 — Quick listing removal

Each grid listing includes an accessible, always-visible × button that removes only its listing without confirmation. Product rows remain, including empty rows. The existing product-menu removal flow remains available.

The background keeps at most 100 undo snapshots in session memory, scoped by unguessable tokens. Undo restores original listing data and ID at its prior index, requires its original product/store to exist and rejects duplicates. The grid can retrieve undo tokens again after reload. Restarting the background/browser, importing a backup or dismissing the undo history invalidates tokens. Removed snapshots are not part of watchlist backups. Scan tombstones prevent stale queued/in-flight results from overwriting a removal or immediate undo during the current scan.

All 31 regression test files and runtime JavaScript syntax checks passed. New tests cover repeated granular removal, retained rows/other listings, undo/full history/details/order, reloading controls, missing IDs/reused tokens, duplicate protection, removing/restoring during an in-flight scan and import reset. No live Firefox UI execution was performed.

## v1.0.16 — First-price scans, missing-page exit and learning

Scan reads execute during page loading using document_start injection rather than gating on complete. The first valid price returns immediately; blocked/unavailable/recognised terminal missing-page results also close the scan tab. A deadline watchdog bounds pending reads within the 20-second reading budget. Polling starts at 250 ms, then 750 ms, with a 250 ms inter-listing pause. ShopTo currency preparation remains bounded and automatic scan reads defer through currency navigation without their separate popup wait.

Missing-page detection uses explicit title/main-heading patterns, with verification checks taking priority. It runs before product URL parsing, so a redirect to a non-product 404 path is recognised. A product merely containing 404 in its name or unrelated body text does not count. These are content signals, not HTTP status monitoring. The listing retains its old price and a not-found errorReason; optional scheduled retries exclude that reason, while future scheduled/manual checks can still try again.

Learning now builds reusable selectors through plain child tags and stable semantic ancestors, itemprop price and price-related test IDs. Rules remain unique-on-page, same origin/store region/currency, locally validated and bounded. Successful saved-selector reads teach rules automatically. Up to five layouts are kept per scope. Learned prices precede generic metadata; matching explicit out-of-stock data still takes priority. Missing saved selectors can recover through learned layouts, while ambiguous matches require another pick.

All 33 Node regression test files and runtime syntax checks passed. Updated timing tests cover first success during loading, no stability wait, delayed success, 20-second timeout including a hung read, terminal 404/blocked results, cancellation and cleanup. New reader tests cover missing-page false positives/redirect paths, plain-child learning, second-product/moved-selector reuse, metadata/stock priority and old-price retention. Background tests cover learning from saved reads, five-layout bounds, disabled learning and excluding 404s from automatic retry.

No live Firefox retailer scan or end-to-end timing measurement was performed. Accepting the first valid price can precede later retailer-side price updates; picking the final selling-price element is useful on such sites. No HTTP/webRequest permission was added.

Last run length: each completed/stopped check stores validated start/end timestamps, elapsed milliseconds and a partial flag in lastCheck. The progress tile formats seconds/minutes/hours. State migration and backup import preserve valid values. Tests cover formatting, validation, completed/stopped runs, restart and backups. Older states show a dash until the next completed check.

## v1.0.17 — Selected site waits

Adds host-scoped policy for Boox (minimum 2.5 seconds, 1.5-second price/variant stability) and Smyths (45-second verification grace). Other stores keep first-price acceptance and their 20-second reading budget. Smyths can resume price reading after a challenge clears; total verification/reading wait is capped at 65 seconds to avoid repeated challenge oscillation extending a tab indefinitely. Unresolved challenges remain blocked and store-level suppression still applies. Stop/404 behavior and cleanup are retained.

Boox product reads require a unique selected main variant control and match any variant query in the saved URL. The variant ID is part of the settling fingerprint. Exact selected Product Offers can supply an automatic price even when the parent Product URL lacks the variant query. Different warehouse/bundle IDs are rejected. An unsettled successful reading at timeout becomes a failure and preserves the old price.

All 35 Node regression test files and runtime syntax checks passed. New coverage includes standard-to-keyboard price changes, same-price variant changes, continuous-change timeout, requested bundle/warehouse readiness, exact variant offer/stock matching, verification recovery/expiry/stop, total wait cap, unrelated host guards and normal first-price/404 behavior. A minimal offer fixture was extracted from the Boox product HTML retrieved 2026-10-29. No live Firefox verification or bundle-switch timing test was performed.

# 1.0.18 — Longer, resilient Smyths CAPTCHA wait
- Gives Smyths up to three minutes from the first detected challenge; slow or unrecognised loading also gets a three-minute budget.
- Temporary read errors during verification no longer end the wait. A confirmed price or stock result must settle for three seconds before the tab closes.
- Adds a ten-second minimum on Smyths to catch verification appearing after early product data. Stop and confirmed 404 exits remain immediate.
- Boox and other stores retain their existing behaviour. UUID and permissions are unchanged.

Validated with all 35 regression files and runtime syntax checks. Live Firefox testing remains outstanding.

# 1.0.19 — Direct date selection and stock change history
- Recent changes always shows a labelled date picker. Choosing a date immediately filters to that day; Today and All time remain available.
- Logs confirmed Out of stock and Back in stock events with product, store and timestamp, independently of notification settings. Repeated checks do not duplicate stock events; failed or unknown readings do not imply recovery.
- Newest first includes stock and price changes together. Price-drop sorts place stock events after the reductions, newest first, within the existing 30-entry display limit.
- Stock events persist after restart and in backups. Older price-only backups remain compatible. Historical stock events cannot be reconstructed.
- Extension ID, permissions and other site readers are unchanged.

All 36 regression test files pass; runtime syntax checks and Firefox lint pass. Live Firefox verification remains outstanding.
