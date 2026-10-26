# Button audit — 26 October 2026

Release: **1.9.2**. Scope: Intent settings, popup, intent/preset/reset dialogs, budget page, Home/watch recommendation controls and the YouTube masthead control.

## Purpose and appearance

| Purpose | Examples | Treatment |
| --- | --- | --- |
| Primary action | Save preferences, Create intent, Apply preset, retry, Close/Return on budget page | Solid YouTube-style ink/paper fill, contrasting text, rounded shape; no competing visible border |
| Secondary action | Cancel, New/Edit preset, Add intent, preview, Show/Hide filtered examples, Reset settings entry | Explicit neutral fill, 1px neutral border, readable text; no browser-default button colors |
| Destructive entry | Delete intent, Delete preset | Red text and 1px red outline; quiet background |
| Destructive confirmation | Reset to defaults, confirm Delete preset | Solid red with its own contrasting foreground in each theme |
| Selection | Intent cards, icon palette, budget presets, timer policy | Selected fill/check/radio plus accessible pressed/selected state; selection does not rely on color alone |
| Compact utility | Pause, Intent off, close, edit, reorder, toolbar refresh/settings | Context-sized outline or icon treatment, accessible name and keyboard focus; masthead remains compact |
| Navigation | Settings link, Search YouTube, Manage budget | Navigation remains a link with focus and hover feedback; prominent navigation can use a button surface |

The budget page keeps Close/Return as its primary action; continuing with an exempt intent is secondary. Normal primary actions use YouTube's dark/light ink palette. Forest green/sage remains the accent for focus, links, enabled switches and timer status. Red is reserved for destructive actions and critical states.

## Sizing and typography

- Standard actions: **14px**, weight **500**, **20px** line height, **40px minimum height** and consistent horizontal padding/radius.
- Dense template actions use 13px; compact Off/Pause labels use 12–13px and 36px targets. Masthead icon buttons retain their 30px targets inside the existing thin control; its narrow launcher/menu targets remain 44px.
- Close buttons are 40px. Intent pencil targets are 32px in settings and 28px in the popup. Reorder targets are 28px. Icon glyphs remain smaller than their clickable areas.
- Switch targets are **44×40px** while retaining the familiar **36×20px** visible track.
- On coarse-pointer layouts, standard actions, close controls and switches expand to at least 44px high. Dense pencil/reorder controls expand to 36px, preserving space between adjacent controls.
- Popup width is bounded by the viewport. Adaptive intent columns and two-line labels prevent tall broken-word stacks; full intent names remain available in accessible names and hover titles.

## State and accessibility checks

- Explicit neutral backgrounds replace platform-dependent fills, including Cancel and library/preview actions.
- Enabled text actions are checked against a **4.5:1 contrast floor** in light/dark fixtures, including selected and destructive hover states. Disabled actions are intentionally subdued and excluded from the contrast floor.
- Disabled controls cannot acquire an enabled hover fill; pressed and selected controls remain distinct. Keyboard focus uses a visible green/sage outline.
- Switch thumbs and selected markers retain positional/shape cues. Forced-color rules retain button outlines and selected-state indicators.
- Open dialogs, full settings and popup are checked at 1440px and 390px; touch fixtures check target expansion. Home/watch and toolbar checks use the real components on deterministic YouTube markup.

## Verification

`npm test`, `npm run check`, `npm run test:browser` (including `tests/button-audit.cjs`) and `npm run test:extension`.

The audit includes rendered screenshots and computed styles, not every possible operating-system font or live YouTube experiment. Classification, timer accounting, permissions and stored preferences are unchanged by this visual release.
