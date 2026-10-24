# Validation — 24 October 2026, version 1.3

## Verified

- All **31 Node tests** pass. They cover settings, distraction rules, daily usage, concurrent requests, blocking policy, bounded search requests, parsers, description/hashtag/tag extraction, caching, semantic-result handling, stale-response protection, current-video exclusion from watch recommendations, and persisted appearance from active top-level YouTube tabs.
- Syntax checks pass for runtime source files.
- Chromium UI/DOM checks pass: Home/watch feeds, sidebar and below-player placements, preservation of the player node/time without pause calls, current-video exclusion, SPA video navigation, live YouTube light/dark appearance, settings/popup theme overrides, compact card placement without skipped slots, mode refresh, loading more, duplicate suppression, out-of-order responses, error states, restoring the native feed, Shorts protection, per-mode drafts, saved preferences, popup and narrow layouts.
- **Actual packaged inference** passes semantic regression checks in Chromium using the shipped quantized model and WASM runtime. The examples include programming, music, science and travel paraphrases without configured keywords, plus an opaque title classified from hashtags/tags. Cross-mode distractors are excluded. All inference network requests stay on the packaged origin, and the model is loaded once and reused.
- **Installed-extension model execution** works from `chrome-extension://` under the production Content Security Policy.
- **Fresh-install end-to-end checks** pass with the real Manifest V3 worker, real offscreen model host, real content scripts and deterministic YouTube network responses. Settings load without manual model warming; Work gets a filled semantic feed; switching to Music refreshes it using descriptions. Watch-page recommendations use the actual local model, exclude the current video and preserve the player while switching modes. YouTube light/dark appearance propagates to the feed and extension settings without discarding an unsaved topic draft. Exhausting a seeded one-minute budget redirects existing YouTube tabs and real declarative network rules redirect new visits. Increasing the budget removes the block.
- A live public YouTube search page was fetched successfully and yielded **19 readable videos** through the actual parser. This is a snapshot of one current layout, not coverage of all YouTube variants.
- The selected dependency tree reports **zero known vulnerabilities** in `npm audit` at validation time. The Node-only `sharp` dependency is overridden to 0.35.5; it is not part of browser inference.

The background-worker startup limitation recorded for version 1.0 did not reproduce in the final fresh-profile checks. The final test starts from an uninitialized extension, rather than relying on a manually warmed model.

## Limits of this verification

The installed-extension end-to-end checks use synthetic YouTube responses so they remain deterministic and do not access an account. They exercise real extension messaging, model execution, UI and network redirects, but cannot prove compatibility with every live YouTube layout, consent state, country, browser policy or experiment.

The semantic evaluation is a small regression set, not a representative accuracy benchmark. No precision/recall or usefulness guarantee is claimed. The model is English-focused, similarities are not confidence probabilities, and full descriptions/tags may be inaccessible. No transcript, audio, video-frame or thumbnail understanding is included. Clickbait detection remains heuristic.

In the version 1.3 local browser run, the small twenty-comparison model regression took about 0.7 seconds after the test page opened, including initialization. This is a development-machine observation, not a latency or battery guarantee for other hardware. Network retrieval is additional. The packaged model/tokenizer/runtime occupy about 44 MiB before ZIP compression; process memory is additional and has not been benchmarked.

## Commands

```sh
npm ci --ignore-scripts
npm test
npm run check
npx playwright install chromium
npm run test:browser
npm run test:model
npm run test:extension
```

For a live account check, reload the unpacked extension, refresh YouTube, switch modes, and inspect relevance and layout. Change the budget above today's used time after testing a short limit; changing it does not erase usage.
