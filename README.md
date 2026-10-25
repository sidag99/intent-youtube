# Intent

**YouTube, with purpose.** A Chrome / Edge extension with intent-driven home and watch-page recommendations, local topic analysis, distraction controls and a daily budget.

- **Filled home and watch feeds:** Work, Study, Music and the optional intents you install load matching videos from public YouTube searches. Approved videos appear in a compact home grid or a recommendation list beside/below the current video, without holes left by rejected recommendations.
- **Controls left of search:** on YouTube, a clearly labelled Intent selector, refresh control and settings shortcut sit to the left of YouTube’s search box, keeping search and the microphone together. The original green-and-white logo opens a custom menu with keyboard navigation. There is no separate feed banner. The toolbar reserves a fixed space so long names or status changes do not resize the search field; long names use an ellipsis. Intent off remains visible and can be re-enabled from the same control. The unused native Home chip-bar space collapses during filtering and returns when filtering stops. Feed backgrounds blend with their surroundings. Search and unsupported pages explicitly show **Off here**, while loading and failed feeds show their current state.
- **Your own definitions:** use the pencil on any intent to edit its name, description, topics and channels, including Work, Study and Music, or add up to 24 optional/custom intents. Custom intents have a choice of 20 icons. A configured description replaces the broad built-in topic scope. Built-in editors show their exact factory semantic descriptions, topic keywords and discovery searches, with a live indication of whether the built-in scope or a custom description is in use.
- **Optional intent library:** add Gaming, TV & Film, Making & Building, Artificial Intelligence, News, Travel, Cooking, Fitness, Art & Design, Photography, Languages, Science, History, Finance, Nature, DIY & Repair, Books or Wellbeing. Templates become editable custom intents; adding one does not switch the current intent. Arrange the installed intents in any order, shared by settings, popup and toolbar. Leisure is removed; old Leisure selections fall back to Work.
- **Editable role presets:** General, Software engineer, Accountant, Designer, Researcher and Student provide starting descriptions for Work and Study. Apply, rename, edit, delete or create role presets. Applying changes only the two descriptions, and each intent stays editable afterward.
- **Independent tab memory:** a tab keeps its selected intent across reloads. Choose whether new tabs follow the last-used intent or always start in a particular intent. Changing one tab leaves other tabs alone.
- **Pause individual tabs:** choose **Pause on this tab** in the toolbar menu or popup. YouTube's native content returns, all distraction filtering stops, and that tab adds no time or budget block. Other tabs remain active. Resume restores the tab's saved intent.
- **Refresh and find more:** switching modes or editing topics rebuilds the feed. Refresh rotates its searches; Find more adds another batch. Duplicate videos are removed. The original YouTube recommendations and layout return when modes are off. Switching modes preserves the current video player.
- **YouTube-style light and dark UI:** feeds follow YouTube's theme, including live theme switches. Extension accents use the logo's forest green in light mode and a lighter sage in dark mode. Popup, settings and break pages use the last theme detected on an active YouTube tab, with the system theme as the initial fallback.
- **Bundled semantic AI:** a small, quantized MiniLM embedding model compares meaning, including titles without literal mode keywords. The model and CPU/WASM runtime ship inside the extension. No companion app, account, API key, model download or GPU setup is required.
- **Descriptions and hashtags:** search snippets, channel names and hashtags inform classification. Choose 0–40 fuller checks per search batch (default 4). Each uncached check makes an extra public video-page request to read the fuller description, hashtags and tags. Higher limits may improve matching but use more network traffic and take longer. The feed reports extra video-page requests and cached checks.
- **Fewer distractions:** hide Shorts and obvious title-based clickbait; turning Hide Shorts off allows matching Shorts through topic classification, using a horizontal shelf after the first video row, left/right scroll arrows, portrait thumbnails and Shorts links; customize included channels, extra topics and blocked phrases.
- **Shorts protection without blocking navigation:** Hide Shorts also removes its sidebar entry. Direct Shorts links hide and pause the player, with a readable, opaque message inside the content area; YouTube's logo, header and remaining navigation stay usable.
- **Daily budget:** set 1–1,440 minutes shared by the intents you choose to count. Music is excluded by default. Exempt intents add no time and stay accessible after the limit; counted intents are blocked until local midnight.

## Install

1. Download the repository with **Code → Download ZIP**, extract it, or use the supplied `intent-extension.zip` package.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
4. Pin Intent and refresh any already-open YouTube tabs.

The committed package includes model assets and the inference runtime, so there is **no npm or AI setup for end users**. Chrome 120+ is required. This is an unpacked development extension; it has not been published in an extension store. Firefox and Safari packaging are not included.

For an existing installation, replace its files, click **Reload** on the Extensions page, and refresh YouTube tabs. Version 1.7.1 groups creation with the intent library, shares creation/edit controls, adds real-video model previews and in-selector drag ordering, simplifies Settings navigation, matches accents to the green logo, and restores Chrome indicator states automatically after reload. No new permissions beyond version 1.2 are required.

## How the feed works

The extension preserves YouTube's URLs and navigation, and replaces home and watch-page recommendations while a mode is active. On watch pages it replaces only the related-video area beside or below the player, excludes the video being watched, and refreshes on video navigation without restarting playback. Live chat and playlists stay in place. Autoplay and recommendations inside the player's end screen remain controlled by YouTube. It searches for the mode's subjects and your custom topics/channels, reads public search-page data without executing page scripts, applies distraction rules, and analyses candidate metadata with the bundled semantic model. It does not control or retrain YouTube's personalized recommendation algorithm.

Two topic searches are fetched per batch. The initial feed can fetch one additional batch when fewer than twelve videos qualify. Find more explicitly requests further topics, with at most 120 displayed videos per feed. Refresh rotates the topic order and refreshes the first searches. No unrelated filler or empty card placeholders are inserted. Search failures and exhausted matches show an explanation and retry/search options; a complete feed cannot be guaranteed for every topic.

When navigating back to Home, native recommendations are hidden before the SPA transition paints them, until the replacement feed is mounted. The guard affects only Home content, clears immediately for Off/Pause and settled unsupported navigation, and has a 15-second fallback for a failed or cancelled transition. The menu shows a short status line; longer explanations are available in tooltips. Manually choosing Off displays **Intent is off**, distinct from **Off here** on unsupported pages.

Fuller metadata is checked in groups of at most four, until twelve confident matches are available, the configured cap is reached, or a 45-second enrichment deadline expires. Unchecked/failed candidates retain their initial metadata-based decision. Cached descriptions need no new video-page request; concurrent feeds share in-flight metadata requests. The cap applies to each search batch, so the initial two-batch feed may check up to twice the configured amount. Search-page and thumbnail requests are additional to the displayed fuller-check request count. Set the cap to zero for search metadata only.

Search results are cached in worker memory for ten minutes; fuller descriptions are cached for up to a day, subject to bounded cache sizes. Metadata, model vectors and feed caches are not persisted as browsing history. The last detected YouTube light/dark appearance is saved locally so extension pages match it. Old requests cannot overwrite a newly selected mode, and search/model work does not block the usage-accounting queue.

The model runs in a dedicated worker hosted by an offscreen extension document. It uses a single CPU/WASM thread. Tokenizers, weights, runtime code and WASM are bundled; remote model loading is disabled. Inference remains on the device. The first analysis initializes the model; later analyses reuse it and cached embeddings. Memory and speed vary by device.

## Topic and distraction controls

Use the pencil button next to an intent, then **Intent description**, to define what each built-in intent means to you. Leave it blank to restore the built-in scope. A saved description drives the local semantic profile and replaces broad default search subjects; extra topics still expand it. Custom intents, including installed templates, require a name and description, can be edited or deleted, and have their own channel rules and timer switch. Deleted intents fall back safely to an available intent.

Use the description as the main place for your purpose and subjects. **Advanced options → Additional discovery topics** is optional: these subjects add search queries and semantic examples while keeping the description intact. They expand the scope; leave the field empty if the description already covers what you want. Existing extra topics are preserved and automatically shown when present. Separate them with commas or newlines. Add full displayed channel names to include them in a particular mode; channel entries are exact matches ignoring case, rather than `@handles`. Channel exceptions still obey Shorts, clickbait and blocked-phrase rules.

The semantic model is English-focused and has only a small regression evaluation so far. It does not watch videos or inspect thumbnails, and cannot recover a topic from missing or misleading metadata. Work and Study can overlap. Similarity scores are not calibrated probabilities. Incorrect inclusions and exclusions remain possible; this is not a guaranteed judgment of usefulness or factual quality.

Descriptions and video tags are read when publicly available; consent screens, age restrictions, unavailable videos and changed page structures may prevent access. Hashtags are extracted from available title/description text and split where practical, such as `#MachineLearning` into `Machine Learning`. No transcript or full audiovisual analysis is included.

Clickbait filtering remains a separate rule-based heuristic for common phrases, repeated punctuation and lengthy all-caps titles. YouTube changes its HTML and A/B tests layouts, so search parsers and selectors will need maintenance. The settings page starts built-in intents with illustrative keyword/distraction examples. For custom intents, use **Preview my intent** to retrieve real YouTube candidates and evaluate their meaning with the bundled model. The embedding model does not generate video titles or invent examples.

Mode filtering affects home and watch-page recommendations. Searches and intentional direct long-form video visits remain available, subject to distraction filters and the daily budget. YouTube Music participates in the same per-tab timer policy, but its music-specific home is not replaced by this feed. Exemption depends on the selected intent, rather than detecting whether a particular video contains music.

## Role presets and intent templates

Role presets are starting points for Work and Study, rather than separate accounts or saved browsing profiles. Preview the two descriptions before applying a preset. Applying preserves intent names, extra topics, channel rules, Music/other intents, timer settings and tab selections. Extra topics and channel inclusions therefore remain capable of expanding the resulting scope. Editing a saved role preset does not change already-applied descriptions; apply it again when wanted. Editing an intent does not update the saved preset. Deleting a role preset leaves current intents in place. Up to 20 role presets can be saved; a blank preset description restores that intent’s standard built-in scope. Factory reset restores the six original presets.

**Create your own intent** sits beside the library and opens the same editor used for editing: name, icon, description, channel inclusions, daily-timer rule and optional Advanced discovery topics/shared blocked phrases. These preferences save together; Cancel discards the new draft. The popup provides one Settings link.

Intent templates add focused modes to your installed list. The library remains collapsed until opened and can be searched; no extra modes are installed automatically. Choose an icon in a custom intent’s pencil editor, and reorder directly in the Settings intent selector using drag handles, move buttons, or arrow keys/Home/End on a focused handle. The order persists across reloads. Delete installed templates through their intent editor; their factory template remains available to add again.

Optional templates are a useful way to limit clutter, but their topics can overlap and they are only starting scopes. News selects news-related metadata; it does not verify reporting accuracy or source quality. Customize any description to narrow the scope you want.

## Real-video filter preview

**Preview my intent** is an explicit action on the full settings page. It can make up to two public YouTube search-page requests; cached searches can be reused. It locally classifies up to 24 candidates and displays up to twelve matching/filtered examples with reasons. **Show filtered examples** reveals rejected candidates. Preview uses search metadata and makes no extra video-description requests, even if the live feed's fuller-check limit is higher. Thumbnails load from YouTube. Predictions are examples, not a usefulness or accuracy guarantee.

Previews use saved intent definitions, preserve preferences/tab choices/daily usage, and respect the selected intent's timer exemption and exhausted budget. Old responses are discarded after settings changes or reset. Only the trusted settings page can request a preview; other sites and page scripts cannot trigger this API.

## Tab memory

The toolbar and popup change the current YouTube tab. Search results and other unsupported pages do not receive intent topic filtering: **Off here** means the intent is saved for Home/video recommendations; distraction filters and the timer can still apply. The full settings page edits the last-used intent and global preferences; it does not force all existing tabs into one mode. **New YouTube tabs** can follow the last-used intent or a fixed intent, including a custom intent or modes-off browsing.

Per-tab selections are kept in session storage across reloads and background-worker restarts. A full browser restart uses the saved new-tab policy; tab-specific choices are not promised across browser restarts. Preferences, custom definitions and the last-used intent persist in local storage.

**Pause on this tab** is separate from the **Off** intent. Off removes topic filtering while retaining distraction rules and the mode's timer policy. Pause restores native content, stops all filters and new analysis requests, and excludes that tab from the daily timer and limit. Its toolbar explicitly shows **Paused** with a Resume control; the popup uses a compact labelled action beside its heading. The Chrome extension-menu indicator uses a pause-bars icon with no text badge while paused, OFF when only topic filtering is off, a mode initial while active, and END when a counted intent is blocked. Indicator images, badges and titles repaint automatically during reloads, including temporary tab-query gaps. Outside YouTube its icon is gray and its title says Off on this site. The pause survives reloads and worker restarts, stays local to that tab and clears when it closes or leaves YouTube. New tabs start active under your chosen new-tab intent policy. Requests already sent may finish for the shared cache; pausing prevents further model passes or fuller-check groups for that feed.

## Reset settings

**Reset settings** opens a confirmation explaining the changes. It restores factory preferences and built-in names, removes custom intents/rules, restores the role-preset library and initial intent order, clears per-tab pauses, and sets open tab intents to Work. Daily usage history and the detected YouTube appearance are retained. Reset is a settings reset, not a way to erase today’s time.

## Time accounting

- Each intent, including custom intents and modes-off browsing, has an independent **Count time** switch. Music starts excluded; other intents start counted. Changes apply to future accounting and do not erase time already used.
- Counts foreground YouTube browsing while its browser window is focused and the system is active (60-second idle threshold).
- Only counted intents add time. Exempt foreground tabs and exempt background audio add none. Counted background playback can still add time while an exempt tab is in front.
- By default, also counts reported playing media or audible YouTube tabs in the background. Disable Count background playback to count foreground use only.
- Counts elapsed time once across multiple tabs; stops while the screen is locked.
- Stores daily totals locally for at most fourteen calendar dates. Browser restarts and mode changes do not reset today's balance.
- Checks playing pages about every five seconds, with a thirty-second alarm fallback. Delayed accounting intervals are capped at thirty-five seconds to avoid charging long sleep gaps. Browser throttling can delay accounting/blocking; this is not a second-accurate timer.
- The budget resets at local midnight; clearing the prior day's block can wait until the next alarm or break-page refresh.
- Blocks top-level YouTube and YouTube NoCookie visits in counted intents. Session network rules keep existing exempt tabs available, while new visits use the configured new-tab policy. The break page offers available exempt intents. Third-party pages and their embedded players remain outside the extension’s scope; budget redirects apply only to top-level YouTube visits.

You can change the limit or disable the extension. It is a personal boundary within a browser profile, not a device-wide restriction or parental control.

## YouTube-only scope

Content scripts run only on top-level YouTube/YouTube NoCookie pages. They are not injected into other websites or their embedded YouTube frames. The background queries YouTube tabs and Intent’s own break page; it does not inspect other apps or website content. On other sites, the popup explicitly shows **Off on this site** and offers no active filtering controls. System idle/window-focus signals are used only to avoid charging inactive YouTube time.

## Privacy and permissions

**No cloud inference, analytics or remote scripts.** Searches necessarily send mode/topic queries to YouTube, and thumbnails are loaded from YouTube's image servers. Fuller metadata requests go only to public YouTube watch pages. Background search/watch requests omit cookies; they are not submitted as searches through your signed-in page. YouTube can still see ordinary network details such as your IP address.

| Permission | Purpose |
| --- | --- |
| YouTube / YouTube NoCookie hosts | Filter cards, retrieve public results/metadata, observe playback and redirect exhausted tabs. |
| `storage` | Local settings/intent definitions, role presets/order/icons and daily totals, plus session tab intents/pauses and an accounting checkpoint. |
| `alarms` | Accounting fallback and overnight recovery. |
| `idle` | Exclude inactive foreground use and locked devices. |
| `offscreen` | Host the dedicated worker for the packaged local model. |
| `declarativeNetRequestWithHostAccess` | Redirect new YouTube visits after the budget is exhausted. |

No broad `tabs` or external AI-provider host permission is requested. Content scripts cannot write settings directly. The toolbar has separate, top-level YouTube-only messages for the selected mode and this tab’s pause; it cannot edit budgets or global distraction rules. Feed requests are limited to top-level YouTube home and valid video pages and fixed YouTube search/watch endpoints. Packaged inference code can connect only to the extension's own assets and YouTube. Retrieved data is inserted as text, never executed as scripts.

## Development and checks

Use Node.js 20+:

```sh
npm ci --ignore-scripts
npm test
npm run check
npx playwright install chromium
npm run test:browser
npm run test:model
npm run test:extension
```

`test:browser` exercises the home grid, watch recommendations, light/dark themes and controls with mocked Chrome messages. `test:model` runs the actual packaged WASM model in Chromium, checks semantic paraphrases and hashtag/tag-based classification, and asserts that inference makes no requests outside the packaged origin. `test:extension` loads the real extension in a fresh browser profile, uses deterministic YouTube responses with the actual offscreen model, and verifies mode refresh plus real budget redirects. See [VALIDATION.md](VALIDATION.md) for the complete verification boundary.

To rebuild the worker bundle and pinned model assets after source changes:

```sh
npm run build
```

Only this developer build step may download pinned assets from Hugging Face. Installation/use of the committed extension package does not download models. Asset hashes and the model revision are recorded in `models/Xenova/all-MiniLM-L6-v2/INTEGRITY.json`. Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

```
src/core.js               Settings, distraction rules and calendar accounting
src/feed.js               Public search/watch parsing, caching and result selection
src/home.js               Home/watch feeds, mode refresh and stale-result protection
src/toolbar.js            Compact intent controls beside the native search box
src/feed-theme.js         YouTube-style feed appearance in light/dark themes
src/background.js         Serialized accounting, feed orchestration and blocking
src/semantic.js           Mode descriptions and semantic similarity policy
src/ai-worker-source.mjs   Local embedding model and cached vectors
src/ai-host.js / ai.html   Offscreen worker host
runtime/                  Built inference worker and required WASM
models/                   Bundled quantized MiniLM model and tokenizer
src/content.js            Native distraction filtering and playback reports
src/preview.js            Opt-in real-video model previews and illustrative controls
src/role-presets.js        Editable Work/Study role-preset library
src/intent-library.js      Optional mode templates and intent ordering
src/ui.js                  Popup/settings controls and transparent default editors
```
