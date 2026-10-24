# Validation — 24 October 2026

## Verified

- All **17 Node tests** pass. They exercise real shared policy and background-worker source with mocked Chrome APIs and a controlled clock.
- Syntax checks pass for all five runtime JavaScript files.
- Chromium UI/DOM checks pass: all modes, settings persistence in preview storage, independent switches, saved custom topics/channels, unsaved drafts across mode changes, filtered example videos, a 390px layout without horizontal overflow, and the popup.
- The real content script hides unrelated legacy and modern video cards, Shorts and clickbait in synthetic YouTube markup; it reclassifies cards inserted later and responds to settings messages. A direct Shorts path opens the protective screen.
- Break-page browser checks cover the exhausted-budget message and the transition back to available time.
- Chromium loads the Manifest V3 package without reported manifest errors.

## Verification boundary

The installed background service worker could not be started in the automated Chromium environment on this host. The same issue reproduced with a separate minimal extension and with Chromium 141 and Chrome for Testing 156, so this is consistent with a host/browser test limitation. Its cause has not been established. The optional browser tests mock Chrome messages for DOM behavior; they do not claim to verify the installed service worker, real browser storage, real idle events or live network redirects end to end.

Timer accounting, concurrent heartbeats, stored balances, background playback, locked devices, rule creation, tab redirection and midnight recovery are verified in the Node background harness. Actual live enforcement and current YouTube layouts still need a manual check after loading the unpacked extension. YouTube A/B tests and future markup changes may require selector updates.

## Suggested live check

1. Load the unpacked extension and refresh YouTube. Confirm settings open without an error and mode changes affect home-page cards.
2. Switch between modes, add a channel or topic, and confirm Shorts and clickbait controls work independently.
3. Set the budget to one minute, use YouTube, and confirm all open YouTube tabs redirect at exhaustion. A new YouTube tab should redirect too.
4. Raise the budget, confirm access returns, restart the browser and check that today’s used time remains.
5. With background playback enabled, play music in a background YouTube tab. Confirm time increases once with multiple tabs, then stops when playback stops and YouTube is not focused.

Changing the budget does not erase usage. Increase it above today’s total when returning to normal use.
