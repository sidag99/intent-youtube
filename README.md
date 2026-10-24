# Intent

**YouTube, with purpose.** A Chrome / Edge extension that makes room for what you actually came to watch.

- **Work, Study, Music, Leisure:** show only home-page videos whose titles match the selected mode. Add your own topics and exact channel names for each mode.
- **Hide Shorts:** remove Shorts shelves and navigation links, hide short-form cards, and stop direct Shorts playback behind a return-home screen.
- **Filter clickbait:** hide common bait phrases, excessive punctuation and long all-caps titles. Add your own blocked words or phrases.
- **Daily budget:** set 1–1,440 minutes for all modes combined. When exhausted, open YouTube tabs redirect to a break page, and new YouTube visits are blocked until local midnight.
- **Private by design:** no sign-in, API keys, remote inference, analytics or external runtime dependencies.

## Install locally

1. Download this repository using **Code → Download ZIP**, then extract it. Or clone it.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Turn on **Developer mode** and select **Load unpacked**.
4. Choose the extracted folder containing `manifest.json`.
5. Pin **Intent** from your browser’s Extensions menu. Refresh any already-open YouTube tabs.

Click the toolbar icon to choose a mode, toggle distractions and set your budget. Open the full settings page using the arrow in the popup to customize topics and channels. Settings apply to open YouTube tabs automatically.

No build step or npm installation is needed to run the extension. Chrome 120+ is required. This is an unpacked extension, not a Chrome Web Store release. Firefox and Safari packaging are not included.

## How matching works

Matching is deterministic and local. On the YouTube home page, a video is visible when its title includes a built-in topic or one of your added topics, or its displayed channel name exactly matches a channel you included for that mode. Unknown titles are hidden while a mode is on. Turning modes off restores unmatched recommendations, while the Shorts, clickbait, blocked-term and time-budget settings remain independent.

Topics match whole words or phrases, ignoring case. Separate topics and channel names with commas or newlines. Custom keywords can use any language; built-in topics and clickbait phrases are English. Channel entries use the full displayed name, not the `@handle`. Channel exceptions do not bypass Shorts, clickbait or blocked-term filters.

Mode filtering changes home-page recommendations; it does not prevent intentional searches or direct visits to long-form videos. Distraction filters also apply to supported recommendation cards outside the home page. YouTube Music is included in the time budget, but its music-specific home page is not mode-filtered.

Clickbait detection is an approximation, not a factual quality judgment. It cannot understand thumbnails, the video’s actual contents or every misleading title. YouTube changes its page markup; selectors may need maintenance. The settings page includes clearly labeled illustrative videos for trying your rules, not a copy of your live recommendations.

## Time accounting

- Counts foreground YouTube browsing while the browser window is focused and the system is active (idle detection threshold: 60 seconds).
- By default, also counts reported playing media or audible YouTube tabs in the background. Turn **Count background playback** off to count only foreground use.
- Counts elapsed wall time once, even if multiple YouTube tabs or videos are active.
- Stops while the screen is locked. Does not charge long sleep gaps: an individual accounting interval is capped at 35 seconds.
- Stores usage locally by calendar date and retains at most 14 dates. Restarts do not reset the daily balance.
- Checks playing pages roughly every five seconds, with a 30-second browser alarm as fallback. Browser throttling can delay accounting or blocking; this is not a second-accurate timer. The midnight unblock can take up to the next alarm or page refresh.
- Blocks top-level YouTube and YouTube NoCookie visits, including YouTube Music and Studio. New embedded YouTube frames are also redirected when blocked. Existing videos in third-party embedded players are outside active-tab tracking and are not guaranteed to stop immediately.

The daily budget is a personal boundary: you can change it in settings or disable/uninstall the extension. It does not enforce limits across other browser profiles, browsers, devices, incognito sessions without extension access, or YouTube’s native apps.

## Permissions and data

| Permission | Purpose |
| --- | --- |
| YouTube and YouTube NoCookie host access | Read visible card titles/channels, hide distractions, observe playback, and redirect open YouTube tabs after the budget is reached. |
| `storage` | Save settings and daily totals locally; keep the current accounting checkpoint in session storage. |
| `alarms` | Recover time checks when pages are quiet and clear yesterday’s blocking rule after midnight. |
| `idle` | Avoid charging foreground time while the device is inactive or locked. |
| `declarativeNetRequestWithHostAccess` | Redirect new YouTube visits to the break page when the daily budget is exhausted, including while the service worker is asleep. |

No broad `tabs` permission is requested. Usage stores totals, not watched video URLs, titles or browsing history. Content scripts cannot write settings directly: the background worker validates the sending extension page, sanitizes settings, and serializes accounting updates. Storage is restricted to trusted extension contexts. No remote scripts, fonts or other assets are loaded.

## Development

Use Node.js 20+ for the dependency-free tests:

```sh
npm test
npm run check
```

Optional UI and DOM checks (Chrome messages are mocked; these do not exercise the installed service worker):

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Screenshots go to the ignored `test-results/` folder. See [VALIDATION.md](VALIDATION.md) for the checked scope and remaining live verification.

The tests cover classification, Unicode topics, precedence, settings validation, time boundaries, overnight reset, worker persistence, background playback, multiple tabs, locking and concurrent requests. Browser-level verification uses a separate test profile with synthetic YouTube markup; it is not a guarantee of compatibility with every current YouTube experiment.

```
manifest.json        Manifest V3 permissions and entry points
src/core.js          Shared classification, settings and calendar logic
src/background.js    Serialized usage accounting, storage and blocking
src/content.js       Card filtering, Shorts gate, home status and playback reports
src/ui.js            Popup, settings controls and illustrative feed
src/blocked.js       Break page and midnight recovery
tests/               Node unit and background integration tests
```

After editing, reload Intent on the browser’s Extensions page and refresh YouTube tabs so their content scripts update. View background errors from the extension’s **Service worker** link.

Implementation references: [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), and [declarative network rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).
