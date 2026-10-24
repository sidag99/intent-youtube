# Intent

**YouTube, with purpose.** A Chrome / Edge extension with an intent-driven home feed, local topic analysis, distraction controls and a daily budget.

- **A filled home feed:** Work, Study, Music and Leisure load mode-related videos from public YouTube searches. Approved videos appear in a compact grid, without holes left by rejected recommendations.
- **Refresh and find more:** switching modes or editing topics rebuilds the feed. Refresh rotates its searches; Find more adds another batch. Duplicate videos are removed. The original YouTube home returns when modes are off.
- **Bundled semantic AI:** a small, quantized MiniLM embedding model compares meaning, including titles without literal mode keywords. The model and CPU/WASM runtime ship inside the extension. No companion app, account, API key, model download or GPU setup is required.
- **Descriptions and hashtags:** search snippets, channel names and hashtags inform classification. For up to four uncertain results per batch, Intent also tries to read the fuller public video description, hashtags and video tags.
- **Fewer distractions:** hide Shorts and obvious title-based clickbait; customize included channels, extra topics and blocked phrases.
- **Daily budget:** set 1–1,440 minutes for all modes combined. Exhausted budgets redirect YouTube tabs to a break page and block new visits until local midnight.

## Install

1. Download the repository with **Code → Download ZIP**, extract it, or use the supplied `intent-extension.zip` package.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
4. Pin Intent and refresh any already-open YouTube tabs.

The committed package includes model assets and the inference runtime, so there is **no npm or AI setup for end users**. Chrome 120+ is required. This is an unpacked development extension; it has not been published in an extension store. Firefox and Safari packaging are not included.

For an existing installation, replace its files, click **Reload** on the Extensions page, and refresh YouTube tabs. Version 1.2 adds the `offscreen` permission for local inference.

## How the feed works

The extension preserves YouTube's home-page URL and navigation, and replaces the native home recommendations while a mode is active. It searches for the mode's subjects and your custom topics/channels, reads public search-page data without executing page scripts, applies distraction rules, and analyses candidate metadata with the bundled semantic model. It does not control or retrain YouTube's personalized recommendation algorithm.

Two topic searches are fetched per batch. The initial feed can fetch one additional batch when fewer than twelve videos qualify. Find more explicitly requests further topics, with at most 120 displayed videos per feed. Refresh rotates the topic order and refreshes the first searches. No unrelated filler or empty card placeholders are inserted. Search failures and exhausted matches show an explanation and retry/search options; a complete feed cannot be guaranteed for every topic.

Search results are cached in worker memory for ten minutes; fuller descriptions are cached for up to a day, subject to bounded cache sizes. Metadata, model vectors and feed caches are not persisted as browsing history. Old requests cannot overwrite a newly selected mode, and search/model work does not block the usage-accounting queue.

The model runs in a dedicated worker hosted by an offscreen extension document. It uses a single CPU/WASM thread. Tokenizers, weights, runtime code and WASM are bundled; remote model loading is disabled. Inference remains on the device. The first analysis initializes the model; later analyses reuse it and cached embeddings. Memory and speed vary by device.

## Topic and distraction controls

Add short topic descriptions, separated by commas or newlines. Add full displayed channel names to include them in a particular mode; channel entries are exact matches ignoring case, rather than `@handles`. Channel exceptions still obey Shorts, clickbait and blocked-phrase rules.

The semantic model is English-focused and has only a small regression evaluation so far. It does not watch videos or inspect thumbnails, and cannot recover a topic from missing or misleading metadata. Work and Study can overlap. Similarity scores are not calibrated probabilities. Incorrect inclusions and exclusions remain possible; this is not a guaranteed judgment of usefulness or factual quality.

Descriptions and video tags are read when publicly available; consent screens, age restrictions, unavailable videos and changed page structures may prevent access. Hashtags are extracted from available title/description text and split where practical, such as `#MachineLearning` into `Machine Learning`. No transcript or full audiovisual analysis is included.

Clickbait filtering remains a separate rule-based heuristic for common phrases, repeated punctuation and lengthy all-caps titles. YouTube changes its HTML and A/B tests layouts, so search parsers and selectors will need maintenance. The settings page's illustrative cards demonstrate keyword and distraction controls; they are not a semantic-model benchmark or the live feed.

Mode filtering affects the home page. Searches and intentional direct long-form video visits remain available, subject to distraction filters and the daily budget. YouTube Music is included in the budget, but its music-specific home is not replaced by this feed.

## Time accounting

- Counts foreground YouTube browsing while its browser window is focused and the system is active (60-second idle threshold).
- By default, also counts reported playing media or audible YouTube tabs in the background. Disable Count background playback to count foreground use only.
- Counts elapsed time once across multiple tabs; stops while the screen is locked.
- Stores daily totals locally for at most fourteen calendar dates. Browser restarts and mode changes do not reset today's balance.
- Checks playing pages about every five seconds, with a thirty-second alarm fallback. Delayed accounting intervals are capped at thirty-five seconds to avoid charging long sleep gaps. Browser throttling can delay accounting/blocking; this is not a second-accurate timer.
- The budget resets at local midnight; clearing the prior day's block can wait until the next alarm or break-page refresh.
- Blocks top-level YouTube and YouTube NoCookie visits, including Music and Studio. New embedded frames also redirect; existing videos in third-party embedded players are outside active-tab tracking and are not guaranteed to stop immediately.

You can change the limit or disable the extension. It is a personal boundary within a browser profile, not a device-wide restriction or parental control.

## Privacy and permissions

**No cloud inference, analytics or remote scripts.** Searches necessarily send mode/topic queries to YouTube, and thumbnails are loaded from YouTube's image servers. Fuller metadata requests go only to public YouTube watch pages. Background search/watch requests omit cookies; they are not submitted as searches through your signed-in page. YouTube can still see ordinary network details such as your IP address.

| Permission | Purpose |
| --- | --- |
| YouTube / YouTube NoCookie hosts | Filter cards, retrieve public results/metadata, observe playback and redirect exhausted tabs. |
| `storage` | Local settings/daily totals and a session accounting checkpoint. |
| `alarms` | Accounting fallback and overnight recovery. |
| `idle` | Exclude inactive foreground use and locked devices. |
| `offscreen` | Host the dedicated worker for the packaged local model. |
| `declarativeNetRequestWithHostAccess` | Redirect new YouTube visits after the budget is exhausted. |

No broad `tabs` or external AI-provider host permission is requested. Content scripts cannot write settings directly. Feed requests are limited to top-level YouTube home pages and fixed YouTube search/watch endpoints. Packaged inference code can connect only to the extension's own assets and YouTube. Retrieved data is inserted as text, never executed as scripts.

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

`test:browser` exercises the home grid and controls with mocked Chrome messages. `test:model` runs the actual packaged WASM model in Chromium, checks semantic paraphrases and hashtag/tag-based classification, and asserts that inference makes no requests outside the packaged origin. `test:extension` loads the real extension in a fresh browser profile, uses deterministic YouTube responses with the actual offscreen model, and verifies mode refresh plus real budget redirects. See [VALIDATION.md](VALIDATION.md) for the complete verification boundary.

To rebuild the worker bundle and pinned model assets after source changes:

```sh
npm run build
```

Only this developer build step may download pinned assets from Hugging Face. Installation/use of the committed extension package does not download models. Asset hashes and the model revision are recorded in `models/Xenova/all-MiniLM-L6-v2/INTEGRITY.json`. Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

```
src/core.js               Settings, distraction rules and calendar accounting
src/feed.js               Public search/watch parsing, caching and result selection
src/home.js               Compact home grid, mode refresh and stale-result protection
src/background.js         Serialized accounting, feed orchestration and blocking
src/semantic.js           Mode descriptions and semantic similarity policy
src/ai-worker-source.mjs   Local embedding model and cached vectors
src/ai-host.js / ai.html   Offscreen worker host
runtime/                  Built inference worker and required WASM
models/                   Bundled quantized MiniLM model and tokenizer
src/content.js            Native distraction filtering and playback reports
src/ui.js                  Popup/settings controls
```
