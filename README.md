# Game Shelf – Price Watch — v1.0.1

A Firefox extension for tracking product prices and stock across stores. Install the signed extension from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/game-shelf-price-watch/).

To test source changes, open `about:debugging#/runtime/this-firefox` in Firefox and load `manifest.json` as a temporary add-on. The extension has no build step. With Node.js and Python 3 installed, run `node --test tests/*.test.cjs`. Set `PYTHON` to the interpreter path if Python is unavailable on your PATH.

Licensed under [MPL 2.0](LICENSE.txt).

A Firefox price tracker for games, books, clothes, movies, toys, electronics and other products. This release uses a new unique extension ID. Export a backup from the earlier International extension and import it into this separate installation. The original Game Shelf remains a separate extension.

### Watch stock

Enable **Watch stock** when adding a listing from the Firefox toolbar or dashboard. On a saved listing, use **Manage product** and **Save listing details**. Choose **Check stock** in the dashboard, or check one watched listing from **Manage product**.

Use **Change stock schedule** under **Automatic checks** to set the frequency, days and local times independently of the price schedule. Choose **Repeat every few hours** to check every 1 to 23 hours, starting one interval after saving. Stock checks start in manual mode. Keep Firefox open for scheduled scans and grant the listing’s website access when prompted.

With notifications enabled, a watched listing alerts once when confirmed availability follows an observed stock-out. **Alerts** controls watched-listing return notifications, broader return notifications and out-of-stock alerts. Both individual and summary delivery are available. Some stores only expose ambiguous or missing availability; those reads retain the last confirmed stock status. Stock scans use store availability data and preserve price values and histories.

## Install and migrate
1. Export a backup from the old extension before removing it.
2. This new ID creates a separate extension; data will not transfer automatically.
3. Install the signed release when available. For a temporary local test, extract the runtime ZIP into a separate folder and load its manifest through about:debugging.
4. Open the new grid and Import backup. Grant store permissions again; re-enable automatic backups if desired.
5. Verify your watchlist and histories, then disable the old extension to avoid duplicate scheduled scans. Keep the exported backup.

The supplied upload ZIP is unsigned until Mozilla signs it. Temporary add-ons may be removed on browser restart; keep your backup.

Mozilla installation guide: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## Popup changes

The popup has a compact fixed-height layout, a prominent **Price found** result, and a bottom **Open price grid** button. The middle panel can scroll when content or a small screen needs more room, so controls remain reachable. A long product name no longer expands the whole popup indefinitely.

Click **+ Store** to add the website you are viewing without leaving the popup. Enter its name and displayed currency, optionally a region and regional URL path, then grant Firefox access. The popup reads the current product after the store is added.

The **Add listing to** dropdown has a remembered sort choice: Name A–Z, Name Z–A or Recently added. The same preference is used by the Add listing dialog in the grid. Existing products without a recorded creation date use their saved insertion order as the recency fallback.

If a price is missing or incorrect, choose **Choose a different price on the page**, click the selling price, then reopen the popup to save the listing. A price-found badge confirms that a reader found an unambiguous amount; verify it is the desired product/variant and currency before saving.

## Products and categories

New rows have a category: Games, Books, Clothes, Movies & TV, Toys, Electronics or Other. The details field can hold a game platform, book format, clothing size, colour or another variant. Categories can be changed under Manage product; the grid can filter by category. Existing rows migrate to Games.

Keep distinct sizes, editions and variants in separate rows when their prices should not be compared. Product pages that change variants without changing URL need a separate stable listing URL or manual checking.

## Stores and ordering

New installations start with **zero visible store columns**. Add only the stores you want. Existing installations and imported backups preserve their store choices; the update does not erase their stores or histories.

**Manage stores** presents stores in their grid order. Use the left/right arrows to move columns. Names, regions, default currencies and colours remain editable. Deleting a store removes its listings/history after confirmation. Adding a previously deleted built-in site brings its column back.

A regional path such as `/us` or `/de-de` lets different regions on the same hostname have separate columns. Use the site's final hostname after redirects, including `www` where needed. New regions cannot silently reassign existing tracked listings. To change a store's hostname/path, add a new column.

The original five site readers are still available internally but their columns are not created on a fresh install. Other sites use Product structured data or a saved price selection. Not every store can be read automatically; verification pages, changed page structures and inaccessible embedded prices may need attention.

Currencies are sorted by code, with their full English names and flag markers. Flag rendering depends on your system's emoji support; codes and names remain readable without it. The store's currency is the default for new listings. Manage product lets you change a listing's currency; its current amount resets until refreshed, while earlier history retains its original currency.

## Flexible schedules

Choose **Change schedule** above the grid:

- Once a day: choose a time.
- Twice a day: choose two distinct times.
- Once a week: choose a weekday and time.
- Twice a week: choose two weekdays and a time.
- Custom: choose any weekdays and one or two times per selected day.
- Manual only: disable automatic price checks.

An optional starting date defers the schedule until that date. A preview shows the next check. Times use your computer's local timezone, including daylight-saving changes. Keep Firefox open. One catch-up check runs on extension startup if a scheduled check was missed, then normal scheduling resumes.

Checks use a separate temporary window. Changing the schedule does not cancel a scan already running; use Stop for that.

## Automatic exchange rates

New installs use **Automatic** rates. The extension downloads Frankfurter daily reference rates on startup when needed, checks again every 12 hours and before scans when the cache needs refreshing. Use **Currency settings → Refresh rates now** to request an immediate update. No account or API key is needed.

Currency settings show the last download time and the reference dates. These are daily reference rates, not a bank's guaranteed checkout rate. Original prices always remain visible alongside approximate conversions.

If a download fails, the previous cache remains available. An automatic rate older than seven days is excluded from conversions/comparisons and foreign-currency alert thresholds. A service error is shown in Currency settings. Unsupported/missing currencies can use a custom rate.

Expand **Custom rates / override automatic rates** to enter an optional rate, for example `GBP=1.18` with EUR selected. This is an example, not a current quote: it means 1 GBP equals 1.18 EUR. Custom rates take priority and persist until changed or removed. Changing your preferred currency clears old-base rates. Use **Manual rates only** to stop exchange-rate downloads.

Previous manually entered v0.2 rates are preserved as custom overrides. Clear those lines in Currency settings and save if you want online rates for those currencies instead.

The green highlight is the lowest comparable, successfully checked item price less than five days old. Shipping, import charges, taxes added at checkout and card conversion fees remain excluded. Notification thresholds use the preferred currency; smaller changes still appear in history. Absolute price-drop history sorting stays grouped by the original currency.

Provider documentation: https://frankfurter.dev/

## Backups and permissions

Original Game Shelf and International backups are accepted. Import replaces the current watchlist and restores listing histories, colours, stores, ordering, settings and product categories where present. Recent changes are restored when present. Imported listings await a fresh check.

Permissions are not part of backups. Use **Manage stores → Allow website** after import if needed. This version requests store access when you add/allow a store rather than requesting access to five countries' stores on installation.

Settings and watchlists remain local to Firefox. Store checks visit the chosen sites using your browser session. Automatic exchange-rate requests go to `https://api.frankfurter.dev/` and contain only the selected base currency, not your product names, store URLs or watchlist. Standard network metadata is necessarily visible to the contacted service. No analytics, payments, cloud sync or user accounts are included.

## Validation

See VALIDATION.md. Automated model/background regression tests pass. Visual popup sizing, permission prompts and live real-store operation still need testing in Firefox on your computer.

## v0.3.1 popup correction

Removed viewport-relative width/height limits that could trap Firefox’s popup at its initial small size. The document now explicitly requests 480 × 570 CSS pixels, with scrolling for the middle panel. No watchlist or settings migration is required.

## New in v0.4.0

- Price-increase alerts can be disabled independently. Increases remain in the history.
- The large Add this store prompt is now a real button.
- Store requests are saved in the background before permissions are requested. Granting permission completes store creation even if Firefox closes the popup. Reopen the popup to see the completed store; do not add it twice.
- Help links in both the popup and grid open an illustrated instruction page, including price-picking steps.
- Backups & colours offers accent/background settings and optional daily/weekly local backups. A light background switches grid text to dark. Store colours stay independent.
- Optional downloads permission is requested only when enabling/using file backups. Backups are dated JSON files in a named subfolder of Firefox's Downloads directory. Completion/failure is reported. Existing files are kept; no automatic deletion.
- Optional Google Drive backup uses Drive for desktop to sync that one local backup folder. This is NOT direct Google OAuth or native cloud sync. Follow help.html#backups. The extension never receives Google credentials or Drive access. Users choosing this option upload the folder's unencrypted watchlist backups to Google via its desktop app.
- Import now restores valid Recent changes entries, appearance and notification settings. Automatic backup is deliberately disabled after importing; enable it again when ready. Pending permission requests are excluded from downloaded backups.

Backup files include product names, URLs, prices, histories and preferences. They are unencrypted; browser passwords/cookies are not included. The backup status confirms local file completion only, not Google Drive upload. Firefox must be running for automatic backups; due checks occur hourly.

## v0.4.1 — tile colours
Backups & colours now includes Tile / panel background, separately from Page background and Accent. It colours summary tiles, the grid, price cards and panels. Text contrast follows the tile colour independently of the page. The cheapest-price highlight uses the accent. The selection is saved and included in backups; Reset colours restores defaults.

## v0.5.0 — target prices
Manage product (•••) now includes a target amount and currency. Any listing at or below the target can alert on its next successful reading. Alerts are once per listing until a successful above-target reading rearms it. Missing conversions or failed readings do not rearm. Target alerts respect global notifications, bypass the ordinary change threshold and replace the ordinary price-change alert on the same reading. Target settings are backed up; importing rearms them. Clear the amount and save to disable.

## v0.5.1 — schedule form fix
Fixed the weekday selector used when changing scan times: it now collects all checked weekday inputs instead of treating one element as a list.

## v0.5.2 — refresh permissions
Manual refresh requests access to the selected websites before starting. Once allowed, scheduled checks use the same persistent access. Manage stores now offers Allow website for built-in stores too. Missing access is shown on the price grid; scheduled checks do not open empty windows for inaccessible listings.

## v0.5.3 — faster scans, visible failures and Very sale prices
The pause between listings is now one second instead of four (about 7.2 minutes less waiting across 145 listings). Loading pages are polled every half second; unsuccessful reads retry after 1.5 seconds. Two matching successful readings remain 2.5 seconds apart, with the existing 45-second page deadline. Actual scan time depends on page load times and failures; this is not a measured full-watchlist benchmark.

Failed, blocked and unavailable listings have orange tiles and visible error details. Pending first checks stay neutral; successful lowest prices stay green. Old prices are retained on failure.

Very's current-price heading is now recognised separately from its old price and saving, including hidden accessibility wording. Automatic reading, picking the current heading and picking its price box are covered against the retrieved Killing Floor 3 sale-price HTML. Reload the extension and grid, then refresh the listing; re-pick the current price if an old selector still points elsewhere.

## v0.6.0 — watchlist upgrades
- **Retry failed:** the top button retries active error, verification-blocked and unavailable listings only, even if checked recently. Paused products are excluded. The optional scheduled retry runs transient errors once more at the end; it excludes missing permissions, out-of-stock responses and verification challenges. Progress counts attempts, so retries can increase the total.
- **Price charts:** open a product's ••• menu. Each listing has a chart, lowest recorded amount, last recorded drop and the existing history list. Currencies have separate graphs; charts contain retained item-price changes (up to 200), not daily samples or shipping.
- **Delivery totals:** enter shipping per listing in its own currency under •••. Blank means unknown; enter 0 for free delivery. Enable the grid's delivered-comparison switch to highlight the cheapest known delivered total. Missing shipping, expired rates and failed/stale prices are excluded. Shipping is entered manually; vouchers, import charges and checkout taxes remain excluded. Targets and price-change alerts continue to use item prices. Changing a listing's currency makes its old shipping cost unknown until resaved.
- **Back-in-stock alerts:** enable the switch under Price alerts. A confirmed unavailable reading followed by a confirmed InStock/available reading alerts once, even without a price change. Errors and unknown stock do not imply availability. This depends on the store reader reporting stock explicitly.
- **Notification style:** choose Individual notifications (default) or One summary after each scan. Both obey the master switch, increase setting and price-change threshold; target/stock alerts retain their own rules. Summary notifications preview up to three alerts; all collected alerts appear in Latest scan alert summary. Cancelled/interrupted scans identify a partial summary. No notification is sent when nothing qualifies. An explicit popup update outside a scan alerts immediately.
- **Pause / purchased:** under ••• choose Pause / mark as purchased, then Resume tracking when needed. Pausing keeps history and excludes the product from manual, scheduled and failed-only scans. Active and Paused filters are available.
- **Time remaining:** scan progress shows an estimate from the previous run initially, then the current run's average. The first run uses an initial estimate. Slow pages and retries can change it.
- **Duplicates and variants:** existing URLs are identified in both add flows and never duplicated. Pasting an existing URL preserves its picked selector. Platform/edition differences prompt a review; this is a heuristic, not a guarantee. Per-listing details can describe platform, edition, condition or size and appear on the grid.
New preferences, paused products and listing details/delivery costs are retained in backups. These settings are preserved when imported from a backup.

## v0.6.1 — dismiss product menu
Click outside the product dialog to close it. Clicks within the dialog, including its padding and scrollbar, keep it open. Dragging from inside to outside does not dismiss it. The X and Escape remain available. Unsaved form edits are not saved by closing.

## v1.0.0 release review
Renamed to Game Shelf – Price Watch; new UUID assigned for this submission after an ID collision. Requires Firefox desktop 142+. Fixed overlapping backup requests, revoked-download-permission recovery, and unsaved listing edits being replaced during background refreshes. Added local privacy notice and explicit store-request data declarations; private-window operation disabled. See the submission kit review report for verification and remaining live tests.

## Licence
Mozilla Public License 2.0 (MPL-2.0). See LICENSE.txt and LICENSING.md.

## v1.0.1
Automatic Amazon readings prefer recognised Buy New purchase-box prices. Existing manual listings can switch through the popup and save. Delivery cost is editable in the popup. No affiliate behaviour added. Same ID as corrected v1.0.0.

## v1.0.2
Optional Support Game Shelf links in the popup and Backups & colours settings open the creator’s Ko-fi page. No payment is required for existing features.

## v1.0.3
Visible Ko-fi support button with a cup-and-heart icon next to Help on the main grid. The pair remains together when the toolbar wraps.

## v1.0.4
Popup height increased to 600px with tighter form spacing to reduce scrolling.

## v1.0.5
ShopTo selling-price image picking uses a same-product/same-currency JSON-LD Offer. Automatic sold-out checks remain unavailable. Read failures after retries send one optional notice per completed scan, and the grid provides store links for verification and retry. Failed-check preference is preserved in backups.

## v1.0.6
Verification-needed tiles and recovery notices use purple. Unavailable/out-of-stock and ordinary failed reads retain orange. Recovery notices are grouped by status.

## v1.0.7
Listings are active tabs inside the separate scan window. Enable Bring scan window to foreground under Automatic checks if stores need window focus. It defaults off and affects both manual and scheduled checks; it can interrupt other work. Focus is not a guarantee against verification challenges.

## v1.0.8
Recent changes and new scan summaries highlight amounts that still match the current lowest listing in their product row. The grid’s currency/freshness/delivered rules and ties apply. Older summaries acquire this ability after a new scan summary is generated.

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
