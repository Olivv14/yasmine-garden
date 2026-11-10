# Experience resource pack — integration contract

Independent resources, **not an integrated UI and not a backend**. All runtime modules are dependency-free ESM, with no React, network requests, model calls, package edits or import-time DOM/storage writes. Run from repository root:

```sh
node experience/build-catalogs.mjs  # only after editing reviewed catalog.tsv
node experience/test.mjs
```

## Exact exports

| Module | Named exports |
|---|---|
| `themes.mjs` | `THEMES`, `THEME_IDS`, `getTheme`, `contrastRatio`, `checkThemeContrast`, `applyTheme`, `THEME_BRIDGE_CSS` |
| `i18n.mjs` | `LOCALES`, `LANGUAGE_CHOICES`, `localeInfo`, `placeholders`, `validateCatalogs`, `escapeHTML`, `createTranslator`, `formatNumber` |
| `questions.mjs` | `QUESTION_BANK`, `QUESTION_IDS`, `localizedQuestions`, `assertQuestionBank` |
| `preferences.mjs` | `MOOD_ANIMALS`, `validatePreferences`, `createPreferenceStore` |
| `affection.mjs` | `AFFECTION_PHRASE_KEYS`, `createAffectionController` |
| `errors.mjs` | `DATABASE_ERROR_KEYS`, `AUTH_ERROR_KEYS`, `errorKey` |

`locales/en.json`, `locales/fr.json`, `locales/aeb-TN.json` have exactly identical flat semantic keys. `catalog.tsv` is the UTF-8, tab-separated build-authoring source (header `key`, `en`, `fr`, `aeb-TN`). It is not fetched at runtime. Keep source and JSON in sync during reviewed edits; tests compare them. Copy existing copyright/license links intact when using the translated recording-credit strings; these strings translate the supplied app metadata, **not an independent music-rights audit**.

## Fixed translations, not runtime AI

```js
// Example from an entry module at repository root, on browsers supporting JSON
// import attributes (or bundle the same static JSON at build time).
import en from './experience/locales/en.json' with { type: 'json' };
import fr from './experience/locales/fr.json' with { type: 'json' };
import tunisian from './experience/locales/aeb-TN.json' with { type: 'json' };
import { createTranslator, LANGUAGE_CHOICES, formatNumber } from './experience/i18n.mjs';
import { applyTheme, THEME_BRIDGE_CSS } from './experience/themes.mjs';
import { assertQuestionBank, localizedQuestions } from './experience/questions.mjs';
import { errorKey } from './experience/errors.mjs';

const catalogs = { en, fr, 'aeb-TN': tunisian };
const i18n = createTranslator('aeb-TN', catalogs);
i18n.applyLanguage(document.documentElement); // lang=aeb-TN, dir=rtl
// Explicit DOM text contract. This renders literal < and &, not markup.
i18n.setText(document.querySelector('#greeting'), 'affection.phrase01', {
  sender: authenticatedProfile.display_name,
});
// t() is PLAIN TEXT: never feed it to innerHTML, an attribute parser, JS or CSS.
// escapedText() HTML-escapes the entire result, only for serialized HTML text.
// Do not pass escapedText() to textContent (that double-encodes entities).

applyTheme(document.documentElement, 'tunisia');
// Parent must add THEME_BRIDGE_CSS after current CSS (or a CSP-authorized CSS
// asset). Token application alone cannot replace literal dark colors in src CSS.
// No style tag is injected by this pack.
const options = LANGUAGE_CHOICES; // flag + label/accessibility name, no visible codes
// Visible example: 🇬🇧 English / 🇫🇷 Français / 🇹🇳 تونسي.
// Set option.lang and option.dir too. Never use flags as the only accessible name.
// Build selector using createElement/textContent, not template HTML from values.
const count = formatNumber('aeb-TN', 12); // ar-TN NUMBER formatting only
const label = i18n.t('garden.count', { count });
assertQuestionBank(serverSnapshot.questions); // fail closed on ID/text/theme drift
const questions = localizedQuestions(i18n.t); // render prompt/theme from catalog
const message = i18n.t(errorKey(providerError, { domain: 'database' }));
```

`createTranslator(locale, catalogs)` validates all three catalogs and snapshots the selected catalog. It returns `{locale, meta, t, setText, escapedText, applyLanguage}`. Missing keys, unsupported languages, non-string/empty values, malformed placeholders, missing/extra parameters and placeholder mismatches throw. **No fallback to English, Spanish or MSA.** Unknown structured provider errors map to a reviewed generic localized error, not untranslated provider prose. Preserve structured diagnostic codes separately without passwords/tokens/private content. Internal programming-error messages intentionally remain developer diagnostics, not user-facing translations.

The catalog covers current navigation, static screen copy, journal/question composers, recording/media, real sign-in/recovery errors, conflict/quota/recovery/stale/synced statuses, profiles/account settings, themes, notifications and garden/music/backup. This is a copy resource, not a claim that existing hardcoded Spanish DOM strings or provider `.message` output have been replaced. The parent must wire labels, placeholders, button text, document title, alt text, aria-labels, option labels, toasts, confirmations, empty states and dynamic status/error output. New frontend strings added concurrently need the same review/key additions.

### Questions, language and RTL

- Canonical IDs stay `q1`–`q8`. Their original Spanish text/theme is provenance in `QUESTION_BANK`, matching the original template and actual backend SQL seed. It is never a user-facing fallback. Localized questions use fixed `questions.q1`–`questions.q8`; theme filter values use `everyday`, `memories`, `future`, `care`, not translated labels. Do not send translated prompts as RPC identities or edit the server bank.
- Tunisian copy uses Arabic script and Tunisian forms, with `lang="aeb-TN"` and `dir="rtl"`. It is **AI-authored draft, not native-quality validated**, and needs a Tunisian speaker to review meaning, register, gender, affection tone, security/error clarity and all eight question translations before release. French/English also need editorial QA. Do not relabel MSA as Tunisian to hide a fallback.
- `formatNumber` deliberately uses `ar-TN` only for numeric presentation; it does not replace lexical Tunisian text. Compact notation, units and currency are rejected. No automatic date/month/day-name fallback is implemented; use reviewed catalog date words or explicitly numeric dates. Missing Intl numeric support throws.
- Parent RTL work remains: logical CSS properties, mixed-script names/URLs, form `dir="auto"`, `<bdi>` around separate user-name nodes, keyboard/focus and assistive-technology tests. Semantic `lang` and `dir` are independent. The current bridge contains a URL/email input direction rule; it does not claim to mirror the entire UI.
- Place the real authenticated photo bubble in the header upper-right with the flag/full-name language control beside it; adapt logical ordering intentionally for RTL. This pack does not create that UI or a fake profile. The person’s spelling is **Yasmine**; botanical `jasmine` remains the unchanged flower enum. Catalog affection text uses `{{sender}}`, never a built-in person or fabricated memory.

## Exactly ten themes and contrast scope

IDs: `dark`, `light`, `pastel`, `barcelona`, `tunisia`, `italy`, `lavender`, `ocean`, `forest`, `rose`.

Every palette maps the existing `--night`, `--panel`, `--paper`, `--muted`, `--warm`, `--sage`, `--line`, `--error` variables and adds control/focus/on-accent/secondary tokens. Barcelona uses blue with a burgundy secondary, Tunisia red/white, Italy green/white/red. Use `--secondary-accent` on decorative accents or pair it with `--on-secondary` for text. Country/team colors are original palette choices, not official licensed brand assets.

`checkThemeContrast(id)` returns `{fg,bg,minimum,ratio,pass}[]`. Tests check normal-size text at least 4.5:1 for five foregrounds on both main surfaces and both on-accent combinations, plus 3:1 control border and focus contrast. Ratios use opaque sRGB relative luminance, not rounded pass/fail values. These checks do **not** certify the existing app: alpha overlays, photos, disabled opacity, other hardcoded CSS, antialiasing and composed/focus states still need browser QA after integration. Decorative flame/candle art need not inherit text-token checks.

## Preferences: adapter only, no invented cloud

```js
import { createPreferenceStore, validatePreferences, MOOD_ANIMALS } from './experience/preferences.mjs';
// These application functions must be supplied by the parent. No default storage.
const preferences = createPreferenceStore({
  read: scope => approvedPreferenceAdapter.read(scope),
  write: (scope, value) => approvedPreferenceAdapter.write(scope, value),
});
const scope = verifiedProfile.id; // from real Auth -> profile resolution, not a selector
const next = validatePreferences({
  version: 1, language: 'aeb-TN', theme: 'tunisia',
  displayName: nameInput.value.trim(), nickname: nicknameInput.value.trim(),
  photoRef: null, moodAnimal: 'calm',
});
await preferences.save(scope, next); // writes, reads back exact fields, rejects failure
```

The store exposes async `load(scope)` and `save(scope,value)`. Adapter `read` must return a validated object or `null`; `write` resolves only after its real storage commit. There is no memory fallback, fabricated sync, authentication, default user ID, or localStorage implementation. Errors propagate. The current backend only exposes `display_name` as a profile read field and has **no profile-preference/photo update RPC in the supplied contract**. Do not call nonexistent endpoints or write arbitrary profile columns. Build the authorized persistence/photo-upload path separately; until then show the catalog’s pending capability text, not “synced”. `photoRef` is null or an opaque asset identifier, never an arbitrary URL/base64 upload. Private photo download/rendering and consent remain parent responsibilities. `nickname` is provisional: confirm whether the requested “apodos” meant nicknames before exposing it. Mood animals are presentation choices mapping the existing six mood enums; never change backend mood values to emoji or animal names. Preferences do not grant permissions.

## Ten-tap thought interaction, not delivery

```js
import { createAffectionController } from './experience/affection.mjs';
const controller = createAffectionController({
  idFactory: () => crypto.randomUUID(),
  startPhrase: 0,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  // Synchronous state callback, NOT a direct sendNotification call.
  onIntent(intent) { appOutbox.capture(intent); },
  animate({ kind, reducedMotion }) { flowerView.show({ kind, reducedMotion }); },
});
// Parent calls tap once per genuine button click/keyboard activation, not from
// both pointerdown and click. Give every activation a distinct stable ID.
button.addEventListener('click', () => controller.tap(crypto.randomUUID()));
// controller.retry() RETURNS the same intent; it does not call onIntent again.
// controller.reset() explicitly starts another ten-tap burst with the next phrase.
```

`getState()` returns `{tapCount,intent,emissionAttempted}`. There is no timer, notification API, permission prompt, service worker, backend invocation or “delivered” state. Duplicate activation IDs are ignored even across resets during the controller lifetime. The tenth distinct activation latches one frozen intent before callbacks, so re-entry, further taps, callback failure and `retry()` cannot double-emit. Animation is `flower-bloom`, or `static-flower` under reduced motion, once per completed burst. A callback error propagates but keeps the intent available for controlled retry. Do not let animation callback errors mask an outbox error. Callback return promises are not awaited: capture synchronously, and explicitly handle any async persistence failure in the parent. Recreate after reduced-motion preference changes only after preserving pending intent; dispose on logout. Local ledgers last only for this controller’s lifetime, not across page reloads.

**Future event-adapter contract:**

```js
{
  type: 'affection.requested', version: 1,
  idempotencyKey: /* opaque fresh burst ID */,
  phraseKey: /* affection.phrase01 .. affection.phrase10 */,
  tapCount: 10,
}
```

Parent outbox persists the intent before any network send; retries reuse the same key and payload, including after reload. The future authenticated server must derive sender/pair/recipient from verified identity (not accept client ownership), validate the phrase key and quotas/rate limits, and enforce a unique `(sender, idempotencyKey)` with same-payload retry behavior. Resolve the real sender name and recipient’s chosen fixed catalog then. The current backend has no affection-notification RPC: no implementation is implied. Browser subscription endpoints and push credentials must never be hardcoded here. Queue acceptance, push-service acceptance and device display are distinct; none proves delivery. Obtain explicit notification consent and avoid intimate lock-screen previews by default. Exactly ten original short phrases per locale rotate deterministically; there is no runtime random LLM text.

## Translation-model research — primary sources checked 2026-11-10

The current Meta model card for **NLLB-200 distilled 600M** explicitly lists Tunisian Arabic `aeb_Arab` (distinct from Standard Arabic `arb_Arab`), alongside English/French. This is a relevant research reference, **not a claim that it is the latest or best Tunisian model**. Its card specifies CC-BY-NC-4.0, research use, no production release, non-certified output, general-domain/sentence scope and a 512-token training-length caveat. A free-to-use app is not automatically outside the license’s noncommercial restrictions; production and redistribution need an explicit license/use review. No NLLB checkpoint was downloaded, run, embedded or called here. These catalogs were drafted by the current assistant in this session, not generated by NLLB. Recommendation: AI assistance during build-time authoring, human Tunisian review, version-controlled fixed JSON and deterministic runtime lookup. Do not add model accounts, downloads, paid calls, runtime LLM providers or silent MSA fallbacks.

Primary source URLs (documentation/metadata only; no runtime dependencies):

- Meta model card: https://huggingface.co/facebook/nllb-200-distilled-600M
- Raw current card, including `aeb_Arab` and license: https://huggingface.co/facebook/nllb-200-distilled-600M/raw/main/README.md
- W3C language declarations: https://www.w3.org/International/questions/qa-html-language-declarations
- W3C structural RTL markup: https://www.w3.org/International/questions/qa-html-dir
- ECMA-402 NumberFormat specification: https://tc39.es/ecma402/#sec-intl.numberformat
- W3C Push API (future delivery system requires a real push subscription/service worker): https://www.w3.org/TR/push-api/
- WebKit iOS/iPadOS Web Push (Home Screen web apps and user-interaction permission request; feature-detect actual target devices): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

The initial web extraction tool could not extract pages with its configured backend. Primary model-card text was retrieved directly over HTTPS instead; W3C/ECMA docs were fetched directly and WebKit’s primary article was retrieved via search. No external translation provider was used.

## Release gates not executed by this pack

Parent UI integration and remaining Spanish-string audit, real authenticated preference/photo persistence, Tunisian-speaker review, physical iPhone/Android RTL/voiceover/reduced-motion QA, real notification permission/subscription/server/outbox wiring and independent live delivery tests. These resources do not configure Supabase, deploy anything, change RLS or upload existing private data.
