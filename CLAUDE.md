# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**VIC English** — a Progressive Web App (PWA) for professional English learning, targeted at Brazilian workers in maritime, hospitality, COMEX, offshore, hotel, and corporate sectors. Built and owned by VIC Language (Victor Ayres). The app is in Brazilian Portuguese (UI can be switched to EN/ES/DE/IT) with English as the learning language.

## Running locally

No build system. Open `index.html` directly in a browser, or serve with any static file server:

```
npx serve .
# or
python -m http.server 8080
```

ES modules (`import`/`export`) are used in `app.js` and `firebase.js`, so the file must be served over HTTP — opening `index.html` via `file://` will fail due to CORS restrictions on module imports.

## Architecture

**Single-page app with no framework.** All views are `<div class="view" id="view-...">` elements in `index.html`. Navigation works by toggling CSS visibility/display on those divs — there is no router. `app.js` controls which view is active.

### File responsibilities

| File | Role |
|---|---|
| `index.html` | All HTML for every screen in the app (1700+ lines) |
| `app.js` | All application logic — event handlers, view switching, gamification, i18n, exercise rendering |
| `data.js` | All content: segments, missions, phrases, exercises, flashcard decks, memory themes, true/false questions, dialogue scenarios |
| `firebase.js` | Firebase initialization + all auth/Firestore wrappers exported for `app.js` |
| `sounds.js` | Web Audio API sound effects (`SoundFX`) + Web Speech API TTS helpers |
| `sw.js` | Service Worker: cache-first PWA assets + FCM background push |
| `style.css` | All styles (no CSS preprocessor) |
| `baixar.html` | Standalone install/download landing page |

### Firebase backend

- **Auth**: email/password, Google OAuth, anonymous sign-in
- **Firestore**: one doc per user under `users/{uid}` — stores XP, streak, level, badges, progress per mission, diagnosis answers, FCM token
- **Cloud Messaging**: push notifications via FCM; VAPID key placeholder in `firebase.js` (`VAPID_KEY = "COLE_SUA_VAPID_KEY_AQUI"`)

### Content model (`data.js`)

`VICTOR_DATA` is a global object (not a module) with:
- `segments[]` — top-level learning areas (maritime, hotel, COMEX, etc.), each with `phases[]`
- `phases[]` — groups of `missions[]`
- `missions[]` — arrays of `phrases[]` (the actual exercises)
- `memoryThemes[]`, `trueFalseQuestions[]`, `dialogueScenarios[]`, `flashcardDecks[]` — standalone game content

Exercise types within a mission phrase: `translate_pt_en`, `multiple_choice`, `fill_blank`, `word_order`, `memory_match`, `match_columns`. The `type` field on a phrase object selects which exercise UI renders in `view-mission`.

### Gamification

XP is awarded per exercise (score 0/5/10), saved to Firestore via `saveProgress()`. Levels, streaks, daily missions, and badges are all computed client-side from the Firestore user doc on each load. Daily missions reset at midnight (compared against `lastActiveDate` in the user doc).

### Pro / Free access

Each segment in `data.js` has a `pro` boolean. Free users see locked missions. The admin panel can override per-user segment access by writing to `users/{uid}.accessOverrides`. The owner UID is hardcoded in `firebase.js` as `OWNER_UID`.

### i18n

`I18N` object in `app.js` contains translations for PT, EN, ES, DE, IT. Elements with `data-i18n="key"` are updated by `applyI18n()`. Exercise content itself is always bilingual PT/EN — only the UI chrome is translated.
