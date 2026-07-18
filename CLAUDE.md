# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean travel-route planner: search or browse curated tourist spots on a Kakao Map, multi-select them, and see them connected as a numbered route (Polyline). Two independent Node projects: `backend/` (Express) and `frontend/` (React + Vite). No monorepo tooling — run each separately.

## Commands

```bash
# Backend (proxies Kakao REST API so the key never reaches the browser)
cd backend && npm install && npm run dev     # http://localhost:4000, auto-restarts (node --watch)

# Frontend
cd frontend && npm install && npm run dev    # http://localhost:5173
```

There is no test suite, lint script, or build-verification step configured in either `package.json`. `frontend`'s `npm run build` (vite build) is the only correctness check available beyond manually exercising the app in a browser.

### Environment variables

- `backend/.env`: `KAKAO_REST_API_KEY`, `PORT` (default 4000), `CORS_ORIGIN` (default `http://localhost:5173`). Backend exits at startup if the REST key is missing.
- `frontend/.env`: `VITE_KAKAO_JS_KEY`, `VITE_API_BASE_URL` (default `http://localhost:4000`).
- Both keys must be registered in the same Kakao Developers app (Platform Keys page, ID visible in console URL). The **JS key** additionally needs its own domain registered under **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인** — registering the domain under "제품 링크 관리 → 웹 도메인" instead (a common mistake) causes a 401 on the SDK script itself, not a normal search error.
- The REST-key-backed Local Search API also requires the "카카오맵" product to be explicitly activated for the app in the console, separately from having a key.

## Architecture

### Backend is a thin, single-purpose proxy

`backend/server.js` exposes one real endpoint: `GET /api/places/search?query=&category=&page=`, which calls Kakao's `/v2/local/search/keyword.json` and reshapes each result to `{ id, name, address, roadAddress, lotAddress, category, phone, lat, lng, placeUrl }`. `category` controls `category_group_code`: **omit** the param → defaults to `AT4` (관광명소/tourist attractions, used by the plain search tab); pass an **empty string** → no category filter at all (used everywhere else, because museums/cafes/PC방/사우나 etc. live outside AT4). There is no other backend state or persistence.

### Frontend data flow: two place sources feed one selection model

`App.jsx` owns `selectedPlaces` (the ordered route) and `focusPlace` (whichever list row is currently expanded). Two sibling tabs both call the same `handleToggle`/`handleToggleExpand`:
- **검색 tab** (`SearchBar` + `PlaceList`): live keyword search via `api.js` → `/api/places/search`.
- **추천 관광지 tab** (`RecommendedPlaces.jsx`): renders curated data from `data/recommendedPlaces.js`.

`KakaoMap.jsx` renders `selectedPlaces` as numbered pins + connecting Polyline, plus (separately) a "preview" layer of small unselected pins for whatever the recommended-tab currently has loaded, and a pulsing ring for `focusPlace`. Category color coding (cafe/indoor/outdoor/activity/popup/search) is centralized in `categoryColors.js` and used both for pin fill color and for the category tab's active-state background.

### The curated-data resolution model (`data/recommendedPlaces.js` + `RecommendedPlaces.jsx`)

Every curated place starts as `{ name, note? }` — just enough to search for. `RecommendedPlaces.jsx`'s `resolvePlace()` turns that into a full place object one of two ways:

1. **Live resolution** (small/manually-curated lists, e.g. 대구's original hand-picked groups): calls `searchPlaces(query, '')` (empty category = unfiltered), then picks the best candidate by exact name match → substring match → first result whose address contains the region name → first result overall.
2. **Pre-resolved bypass**: if the entry object already has `lat`/`lng`/`id` (i.e. it came from a `bulk/*.generated.js` file — see below), `resolvePlace` returns it as-is with **zero network calls**. This distinction is load-bearing: Seoul alone has 1000+ curated places, and re-searching all of them on every tab open would be far too slow.

`{ displayName }` is a third field some entries carry: when a curated entry's real Kakao name would be misleading (e.g. a time-limited popup store that's just a tenant inside "더현대 대구"), `displayName` overrides the shown name and the effective `id` becomes `${realId}::${displayName}` so two different popups sharing one building's coordinates don't collide as the same list item / React key / selection entry.

`{ endDate }` is a fourth optional field (only used by `popup`-category entries with a real expiry): `isItemActive()` filters these out once `endDate` has passed, checked at render time against `Date.now()` — no cron job, no backend involvement, just naturally stops showing once someone opens the app after the date.

### Region shape: flat vs. districted

`RECOMMENDED_PLACES[region]` is either:
- **Flat**: `{ cafe: [...groups], indoor: [...], outdoor: [...], activity: [...], popup: [...] }` where each category is an array of `{ area, items }` groups (대구 and most other regions).
- **Districted**: `{ __districts: [...gu names], districts: { [gu]: <flat shape above> } }`. Only 서울 uses this (25 gu, "전체" aggregate view merges all gu's groups on the fly, prefixing each group's `area` with the gu name). `isDistrictedRegion()` / `getRawGroups()` / `getFetchTargets()` in `RecommendedPlaces.jsx` branch on this uniformly so the rest of the component doesn't care which shape it's looking at.

`CATEGORY_KEYS = ['cafe', 'indoor', 'outdoor', 'activity', 'popup']` is the fixed tab order everywhere (labels in `CATEGORY_LABELS`, colors in `categoryColors.js`). Adding a category means updating all three plus the flat-shape helper (`emptyCategories()`).

`RecommendedPlaces.jsx` eagerly background-fetches **every** (district × category) combination for the selected region on mount (`fetchedKeysRef` dedupes so each combination resolves once per session), not just the currently-viewed tab — this is what feeds the map's "preview pins" layer, which needs the whole region's data regardless of which category tab is active.

### `data/bulk/*.generated.js` — do not hand-edit

These files hold large batches of already-resolved places (lat/lng/id/category/phone baked in) that were produced by disposable one-off Node scripts (parse a name+address+optional-note TSV dump → geocode each via the backend's `/api/places/search?category=` using an address-anchored keyword match → group by region/gu/dong → emit a `.generated.js` literal). The scripts themselves were not kept in the repo; regenerating this data means re-writing that pipeline (see any past bulk-import commit for the shape: `{name, id, address, roadAddress, lotAddress, category, phone, lat, lng, placeUrl, note?}` grouped into `{area, items}`, split into three files per category-batch — `seoulX.generated.js` (by gu), `daeguX.generated.js` (flat item array merged into 대구's existing category), `otherRegionsX.generated.js` (by region → city/gu groups)). `recommendedPlaces.js` imports all of them and merges them into the relevant category array/gu — **when adding a new bulk batch, double check the merge lands in the right category array**; the file has previously had a copy-paste bug where a batch was spliced into the wrong category.

Match confidence when generating this data follows a tiered fallback (dong-level address match > exact name > first same-region result > first result overall), and low-confidence matches should be spot-checked against the resolved address before being trusted — abbreviated province names (경기 vs 경기도, 경북 vs 경상북도, etc.) commonly produce false-negative confidence flags on matches that are actually correct.

### Map internals worth knowing (`KakaoMap.jsx`)

- SDK is loaded once via `loadKakaoMaps.js` (dynamic script tag, `autoload=false`), memoized so remounts don't re-inject it.
- The "preview scale" setting (1/2/5/10 km, adjustable via the gear icon in `RecommendedPlaces.jsx`) controls when the unselected-pins layer appears: current viewport width is computed with a haversine helper, normalized to km-per-100px (independent of window size — an earlier version compared raw viewport width and was wrong whenever the browser window size changed), and preview pins render only when that scale is at or under the chosen threshold.
- The `idle` map event is debounced 200ms before recomputing preview pins — without this, panning/zooming re-touched dozens of overlay DOM nodes on every intermediate frame and visibly janked.
- Clearing the route (`selectedPlaces` → empty) intentionally leaves the map's center/zoom wherever the user last had it; it does not recenter to the Seoul-default view.
