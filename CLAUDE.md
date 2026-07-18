# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean travel-route planner: search or browse curated/real-time tourist spots on a Kakao Map, multi-select them into a route, get an actual driving/walking/transit path between them (not just straight lines), and save favorites/routes for later. Two independent Node projects: `backend/` (Express) and `frontend/` (React + Vite). No monorepo tooling — run each separately.

## Commands

```bash
# Backend (proxies Kakao/TMAP/ODsay/Google APIs so no key ever reaches the browser)
cd backend && npm install && npm run dev     # http://localhost:4000, auto-restarts (node --watch)

# Frontend
cd frontend && npm install && npm run dev    # http://localhost:5173
```

There is no test suite, lint script, or build-verification step configured in either `package.json`. `frontend`'s `npm run build` (vite build) is the only correctness check available beyond manually exercising the app in a browser.

### Environment variables

- `backend/.env`: `KAKAO_REST_API_KEY` (required — backend exits at startup if missing), `TMAP_APP_KEY`, `ODSAY_API_KEY`, `GOOGLE_PLACES_API_KEY` (all optional but feature-gated, see below), `PORT` (default 4000), `CORS_ORIGIN` (default `http://localhost:5173`). `.env.example` also lists `KTO_API_KEY` but nothing in `server.js` reads it currently — leftover/unused.
- `frontend/.env`: `VITE_KAKAO_JS_KEY`, `VITE_API_BASE_URL` (default `http://localhost:4000`).
- Both Kakao keys must be registered in the same Kakao Developers app (Platform Keys page, ID visible in console URL). The **JS key** additionally needs its own domain registered under **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인** — registering the domain under "제품 링크 관리 → 웹 도메인" instead (a common mistake) causes a 401 on the SDK script itself, not a normal search error.
- The REST-key-backed Local Search/Category APIs also require the "카카오맵" product to be explicitly activated for the app in the console, separately from having a key.
- Missing `TMAP_APP_KEY` breaks walking directions entirely (throws) and disables the TMAP leg of transit directions (falls straight to ODsay). Missing `ODSAY_API_KEY` removes the transit fallback (TMAP failures then propagate as errors). Missing `GOOGLE_PLACES_API_KEY` makes `/api/places/detail` and `/api/places/photo` 500 — the frontend already treats a failed/absent Google detail lookup as "just don't show that section," so the app still works without it.

## Architecture

### Backend: a multi-provider place/routing proxy (`backend/server.js`)

Not a thin single-endpoint proxy — six endpoints, four external providers (Kakao Local, Kakao Mobility, TMAP, ODsay, Google Places), no persistence beyond one in-memory `Map` cache.

- `GET /api/places/search?query=&category=&page=` — Kakao keyword search (`/v2/local/search/keyword.json`), reshaped to `{ id, name, address, roadAddress, lotAddress, category, phone, lat, lng, placeUrl }`. `category` controls `category_group_code`: **omit** → defaults to `AT4` (관광명소, used by the plain search tab); pass an **empty string** → no filter (used everywhere else, since museums/cafes/PC방/사우나 etc. live outside AT4).
- `GET /api/places/nearby?region=&district=&category=` — geocodes `region` (+ optional `district`) to a center point via Kakao's address search (`geocodeCenter`, memoized forever in `REGION_CENTER_CACHE` — admin-district names are a small fixed set), then runs Kakao category search (`/v2/local/search/category.json`, 3 pages, deduped by id) within a radius (5km for a specific district, 20km for a whole region). `category` must be one of `cafe`/`indoor`/`outdoor` (`NEARBY_CATEGORY_CODES` maps to `CE7`/`CT1`/`AT4`) — this is what backs the frontend's live (non-curated) categories.
- `GET /api/places/detail?name=&lat=&lng=&address=` — looks the place up in Google Places (`searchText`, location-biased to a 200m circle around the Kakao coordinates so a same-named place in another city doesn't match) and returns rating/review-count/open-now/weekly-hours/up-to-5-reviews/photo names. Returns `{ found: false }` (not an error) when Google has no match — small local businesses often aren't on Google.
- `GET /api/places/photo?name=&maxWidth=` — streams a Google Places photo back through the backend so the frontend never touches the Google key directly.
- `POST /api/directions` `{ places: [{lat,lng,name}...], mode: 'car'|'walk'|'transit' }` — turns a visit order into a real path:
  - **car**: Kakao Mobility directions (`/v1/directions`). Kakao caps waypoints at 5 (origin+5+destination = 7 points), so routes with more than 7 places are split into overlapping chunks (`MAX_POINTS_PER_REQUEST = 7`, each chunk shares its last point with the next) and stitched together.
  - **walk**: TMAP pedestrian routing (`/tmap/routes/pedestrian`). TMAP only takes two points per call, so `fetchSequentialLegs` calls it once per consecutive pair and concatenates.
  - **transit**: same one-pair-at-a-time approach, but tries TMAP transit (`/transit/routes`) first and falls back to ODsay (`searchPubTransPathT`) on failure (`fetchTransitLegWithFallback`) — TMAP quota exhaustion is the main trigger. ODsay's error shape isn't consistent (sometimes an array, sometimes a single object), so both are checked. Legs under `MIN_TRANSIT_DISTANCE_METERS` (750m) skip the API entirely and become a straight-line walk leg (transit APIs reject same-building-distance queries — ODsay explicitly errors with code `-98` for this, which is also caught post-hoc as a fallback-of-the-fallback).
  - Every leg carries a `path` (for drawing) and `steps` (turn-by-turn / stop-by-stop instructions with `mode`/`routeName`/`distanceMeters`/`durationSeconds`, `fareWon` for transit).
- `GET /api/health` — trivial status check.

### Frontend data flow: three tabs feed one selection model, plus a routing layer on top

`App.jsx` owns `selectedPlaces` (the ordered route) and `focusPlace` (whichever list row is expanded). Three sibling tabs all funnel into the same `handleToggle`/`handleToggleExpand`:
- **검색** (`SearchBar` + `PlaceList`): live keyword search via `api.js` → `/api/places/search`, plus a localStorage-backed search history (`useSearchHistory.js`, max 10 terms, user-toggleable on/off).
- **추천 관광지** (`RecommendedPlaces.jsx`): curated + live-fetched data, see below.
- **즐겨찾기** (`FavoriteLists.jsx`): user-created named lists of saved places (`useFavorites.js`, localStorage), independent of the route. The star button on every `PlaceList` row opens a small menu to toggle a place in/out of any list or create a new one on the fly.

Selecting places into `selectedPlaces` also drives a **directions layer**: whenever the ordered list or `routeMode` (`car`/`walk`/`transit`) changes, `App.jsx` calls `getDirections()` and stores the result in `routeData`; `KakaoMap.jsx` draws the real path (dashed straight line as a placeholder while loading/if it fails), and `RouteDetailPanel.jsx` renders turn-by-turn steps. For transit mode, `buildTransitRouteColors()` assigns each distinct bus/subway line a color from a fixed palette (`TRANSIT_PALETTE`) the first time it appears — TMAP/ODsay's own route colors are frequently blank outside Seoul, so the app never relies on them; walk segments are always gray. The map polyline and the detail panel's line badges share these colors via the same `transitColors` map. Routes can be named and saved to localStorage (`useSavedRoutes.js` + `SavedRoutesPanel.jsx`) and reloaded later, replacing `selectedPlaces` wholesale.

Expanding a place row (in any tab) lazily fetches Google Places enrichment once per place (`PlaceList.jsx`'s `PlaceDetailContent`, via `/api/places/detail`) — rating, open/closed + weekly hours, up to 5 reviews, and a photo strip with a click-to-enlarge lightbox (`/api/places/photo`). A failed or `found:false` lookup just hides that section rather than showing an error, since small businesses are often missing from Google.

`KakaoMap.jsx` renders `selectedPlaces` as numbered pins + the routed polyline (colored per-segment for transit, solid when it's a real path vs. dashed placeholder), a "preview" layer of small unselected pins for whatever `RecommendedPlaces` currently has loaded, and a pulsing ring for `focusPlace`. Category color coding (cafe/indoor/outdoor/activity/popup/search) is centralized in `categoryColors.js` and used for pin fill color, the category tab's active-state dot, and nothing else.

### Curated vs. live data (`data/recommendedPlaces.js` + `RecommendedPlaces.jsx`)

`CATEGORY_KEYS = ['indoor', 'outdoor', 'cafe', 'activity', 'popup']` is the fixed tab order (labels in `CATEGORY_LABELS`, colors in `categoryColors.js`). The five categories split into two entirely different data-fetching strategies (`LIVE_CATEGORIES = ['cafe', 'indoor', 'outdoor']` vs. the rest):

1. **Live categories** (cafe/indoor/outdoor) have no curated data at all anymore — `emptyCategories()` only seeds `{ activity: [], popup: [] }`. They're fetched on demand from `/api/places/nearby` (`searchNearby` in `api.js`) scoped to whatever region/district/category the user is actually viewing (`getLiveTargets`) — not eagerly, because fetching every district × these categories for a region would be dozens of calls. When the district selector is "전체", the live fetch is a single region-wide call (`gu = null`) rather than one per district.
2. **Curated categories** (activity/popup) still use the old hand-maintained-list model: every entry starts as `{ name, note? }`, and `resolvePlace()` in `RecommendedPlaces.jsx` turns that into a full place object one of two ways:
   - **Live resolution** (small/manually-curated groups): calls `searchPlaces(query, '')` (empty category = unfiltered), then picks the best candidate by exact name match → substring match → first result whose address contains the region name → first result overall.
   - **Pre-resolved bypass**: if the entry already has `lat`/`lng`/`id` (i.e. it came from a `bulk/*.generated.js` file), `resolvePlace` returns it as-is with **zero network calls** — Seoul alone has 1000+ curated activity/popup places, and re-searching all of them on every tab open would be far too slow.
   These two categories are still eagerly background-fetched for the whole region on mount (`EAGER_CATEGORY_KEYS`, deduped via `fetchedKeysRef`), which is what feeds the map's preview-pins layer regardless of which tab is active.

`{ displayName }` is a third field some curated entries carry: when a curated entry's real Kakao name would be misleading (e.g. a time-limited popup store that's just a tenant inside "더현대 대구"), `displayName` overrides the shown name and the effective `id` becomes `${realId}::${displayName}` so two different popups sharing one building's coordinates don't collide as the same list item / React key / selection entry.

`{ endDate }` is a fourth optional field (only used by `popup`-category entries with a real expiry): `isItemActive()` filters these out once `endDate` has passed, checked at render time against `Date.now()` — no cron job, no backend involvement, just naturally stops showing once someone opens the app after the date.

### Region shape: flat vs. districted

`RECOMMENDED_PLACES[region]` is either:
- **Flat**: `{ activity: [...groups], popup: [...] }` where each category is an array of `{ area, items }` groups (대구 and most other regions).
- **Districted**: `{ __districts: [...gu names], districts: { [gu]: <flat shape above> } }`. Only 서울 uses this (25 gu; live categories don't need a districted shape since they're fetched region/district-wide on demand rather than pre-grouped). `isDistrictedRegion()` / `getRawGroups()` / `getEagerTargets()` / `districtsInScope()` in `RecommendedPlaces.jsx` branch on this uniformly so the rest of the component doesn't care which shape it's looking at.

Adding a curated category back would mean updating `CATEGORY_KEYS`, `CATEGORY_LABELS`, `categoryColors.js`, and `emptyCategories()` together.

### `data/bulk/*.generated.js` — do not hand-edit

These files hold large batches of already-resolved activity/popup places (lat/lng/id/category/phone baked in) that were produced by disposable one-off Node scripts (parse a name+address+optional-note dump → geocode each via the backend's `/api/places/search?category=` using an address-anchored keyword match → group by region/gu/dong → emit a `.generated.js` literal). The scripts themselves were not kept in the repo; regenerating this data means re-writing that pipeline (see any past bulk-import commit for the shape: `{name, id, address, roadAddress, lotAddress, category, phone, lat, lng, placeUrl, note?}` grouped into `{area, items}`). `recommendedPlaces.js` imports all of them and merges them into `activity`/`popup` only — **when adding a new bulk batch, double check the merge lands in the right category array**; the file has previously had a copy-paste bug where a batch was spliced into the wrong category.

Match confidence when generating this data follows a tiered fallback (dong-level address match > exact name > first same-region result > first result overall), and low-confidence matches should be spot-checked against the resolved address before being trusted — abbreviated province names (경기 vs 경기도, 경북 vs 경상북도, etc.) commonly produce false-negative confidence flags on matches that are actually correct.

### Locally-persisted user data (favorites, search history, saved routes)

Three independent `localStorage`-backed hooks, each with its own key, no shared schema or cross-sync — all live under `frontend/src/use*.js`:
- `useFavorites.js` (`kr-travel-favorite-lists`): an array of named lists (`{ id, name, places }}`), always seeded with a `default` list that can't be deleted. `favoriteIds` (union of every list's place ids) is what lights up the star icon anywhere a `PlaceList` is rendered.
- `useSearchHistory.js` (`kr-travel-search-history` + a separate `-enabled` flag key): last 10 unique search terms, de-duped and moved to front on re-search; can be disabled entirely by the user, in which case `addToHistory` becomes a no-op but existing history stays in storage until cleared.
- `useSavedRoutes.js` (`kr-travel-saved-routes`): named snapshots of `selectedPlaces` (`{ id, name, places, createdAt }}`). Loading one wholesale-replaces the current `selectedPlaces`.

All three are read/write from `App.jsx` and threaded down as props — there's no context provider.

### Map internals worth knowing (`KakaoMap.jsx`)

- SDK is loaded once via `loadKakaoMaps.js` (dynamic script tag, `autoload=false`), memoized so remounts don't re-inject it.
- The "preview scale" setting (0.5/1/2/4 km, adjustable via the gear icon in `RecommendedPlaces.jsx`) controls when the unselected-pins layer appears: current viewport width is computed with a haversine helper, normalized to km-per-`SCALE_BAR_REFERENCE_PX`(50)px (independent of window size — an earlier version compared raw viewport width and was wrong whenever the browser window size changed), and preview pins render only when that scale is at or under the chosen threshold.
- The `idle` map event is debounced 200ms before recomputing preview pins — without this, panning/zooming re-touched dozens of overlay DOM nodes on every intermediate frame and visibly janked.
- The route polyline is dashed and straight-line-only until `routeData` resolves (or if it errors/is loading); once resolved it switches to solid segments, colored per-mode (single blue line for car/walk, per-transit-line colors for transit via `routeSegments` built in `App.jsx`).
- Clearing the route (`selectedPlaces` → empty) intentionally leaves the map's center/zoom wherever the user last had it; it does not recenter to the Seoul-default view.
