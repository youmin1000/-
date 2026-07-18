import { useEffect, useRef, useState } from 'react';
import SearchBar from './components/SearchBar.jsx';
import PlaceList from './components/PlaceList.jsx';
import RecommendedPlaces from './components/RecommendedPlaces.jsx';
import SelectedRoute from './components/SelectedRoute.jsx';
import KakaoMap from './components/KakaoMap.jsx';
import RouteDetailPanel from './components/RouteDetailPanel.jsx';
import FavoriteLists from './components/FavoriteLists.jsx';
import SavedRoutesPanel from './components/SavedRoutesPanel.jsx';
import { searchPlaces, getDirections } from './api.js';
import { useFavorites } from './useFavorites.js';
import { useSearchHistory } from './useSearchHistory.js';
import { useSavedRoutes } from './useSavedRoutes.js';

const DEFAULT_SEGMENT_COLOR = '#3b6ef6';
const WALK_SEGMENT_COLOR = '#9aa0a6';

// TMAP/ODsay가 주는 공식 노선 색상은 지역에 따라 비어있는 경우가 많아(예: 대구),
// 그 값에 의존하지 않고 이 앱이 직접 노선마다 구분되는 색을 순서대로 배정한다.
const TRANSIT_PALETTE = [
  '#3b6ef6', // blue
  '#e0554f', // red
  '#2fa84f', // green
  '#f2994a', // orange
  '#9b59b6', // purple
  '#16a3b6', // teal
  '#c2185b', // pink
  '#8d6e63', // brown
];

function transitRouteKey(step) {
  return `${step.mode}:${step.routeName || ''}`;
}

// 이번 경로에 등장하는 버스/지하철 노선마다 고유한 색을 매핑해서, 지도 폴리라인과
// 사이드바 상세 경로 배지가 같은 색을 쓰도록 한다. 도보는 항상 회색으로 고정.
function buildTransitRouteColors(routeData) {
  const colors = {};
  let idx = 0;
  (routeData?.legs || []).forEach((leg) => {
    (leg.steps || []).forEach((step) => {
      if (step.mode === 'WALK') return;
      const key = transitRouteKey(step);
      if (!colors[key]) {
        colors[key] = TRANSIT_PALETTE[idx % TRANSIT_PALETTE.length];
        idx += 1;
      }
    });
  });
  return colors;
}

// 대중교통은 도보/버스/지하철 구간마다 색으로 구분해서 그릴 수 있도록
// 구간(step) 단위로 쪼갠 좌표+색상 목록을 만든다. 그 외 모드는 경로 전체를 한 색으로 그린다.
// 배지/장식에 쓰는 지도 핀 아이콘 — 이모지 대신 깔끔한 벡터 핀으로 통일한다.
function PinIcon({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 22" fill="none" className={className}>
      <path
        d="M8 21.5S1 13.9 1 8a7 7 0 1 1 14 0c0 5.9-7 13.5-7 13.5Z"
        fill="currentColor"
      />
      <circle cx="8" cy="8" r="2.6" fill="#fff" />
    </svg>
  );
}

function buildRouteSegments(routeData, mode, transitColors) {
  if (!routeData) return null;

  if (mode !== 'transit') {
    return routeData.path && routeData.path.length > 0
      ? [{ path: routeData.path, color: DEFAULT_SEGMENT_COLOR }]
      : null;
  }

  const segments = (routeData.legs || [])
    .flatMap((leg) => leg.steps || [])
    .filter((step) => step.path && step.path.length > 0)
    .map((step) => ({
      path: step.path,
      color: step.mode === 'WALK' ? WALK_SEGMENT_COLOR : transitColors[transitRouteKey(step)] || DEFAULT_SEGMENT_COLOR,
    }));

  return segments.length > 0 ? segments : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'recommended'
  const [places, setPlaces] = useState([]);
  const [selectedPlaces, setSelectedPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewPlaces, setPreviewPlaces] = useState([]);
  const [previewScaleKm, setPreviewScaleKm] = useState(2);
  const [focusPlace, setFocusPlace] = useState(null);
  const [routeMode, setRouteMode] = useState('car');
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [showRouteDetail, setShowRouteDetail] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [routeNameInput, setRouteNameInput] = useState('');
  const routeRequestIdRef = useRef(0);
  const { lists, favoriteIds, createList, deleteList, renameList, togglePlaceInList } = useFavorites();
  const { history, addToHistory, removeFromHistory, enabled: historyEnabled, toggleEnabled: toggleHistoryEnabled } =
    useSearchHistory();
  const { routes: savedRoutes, saveRoute, deleteRoute, renameRoute } = useSavedRoutes();

  const selectedIds = new Set(selectedPlaces.map((p) => p.id));
  const transitColors = buildTransitRouteColors(routeData);

  // 방문 순서 또는 이동수단이 바뀔 때마다 경로(거리/시간/상세 안내)를 다시 계산
  useEffect(() => {
    const requestId = ++routeRequestIdRef.current;

    if (selectedPlaces.length < 2) {
      setRouteData(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }

    setRouteLoading(true);
    setRouteError(null);

    getDirections(selectedPlaces, routeMode)
      .then((data) => {
        if (routeRequestIdRef.current !== requestId) return;
        setRouteData(data);
      })
      .catch((err) => {
        if (routeRequestIdRef.current !== requestId) return;
        console.error(err);
        setRouteData(null);
        setRouteError(err.response?.data?.error || '경로를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (routeRequestIdRef.current === requestId) setRouteLoading(false);
      });
  }, [selectedPlaces, routeMode]);

  async function handleSearch(query) {
    setLoading(true);
    setError(null);
    addToHistory(query);
    try {
      // 카테고리 필터 없이 검색해야 카페/팝업 등 관광명소(AT4) 밖의 장소도 찾을 수 있다.
      const results = await searchPlaces(query, '');
      setPlaces(results);
    } catch (err) {
      console.error(err);
      setError('관광지 검색에 실패했습니다. 백엔드 서버가 실행 중인지 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(place) {
    setSelectedPlaces((prev) => {
      const exists = prev.some((p) => p.id === place.id);
      if (exists) {
        return prev.filter((p) => p.id !== place.id);
      }
      return [...prev, place];
    });
  }

  function handleRemove(placeId) {
    setSelectedPlaces((prev) => prev.filter((p) => p.id !== placeId));
  }

  function handleMove(fromIndex, toIndex) {
    setSelectedPlaces((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleToggleExpand(place) {
    setFocusPlace((prev) => (prev?.id === place.id ? null : place));
  }

  function handleSaveRoute(e) {
    e.preventDefault();
    if (!routeNameInput.trim()) return;
    saveRoute(routeNameInput.trim(), selectedPlaces);
    setRouteNameInput('');
  }

  function handleLoadRoute(route) {
    setSelectedPlaces(route.places);
    setShowSavedRoutes(false);
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <svg className="hero-route-deco" viewBox="0 0 140 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="70" r="13" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 6" strokeLinecap="round" />
            <path
              d="M33 63 C 55 55, 85 42, 104 32"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="1 6"
              strokeLinecap="round"
            />
            <g transform="translate(96, 10.5)">
              <path d="M8 21.5S1 13.9 1 8a7 7 0 1 1 14 0c0 5.9-7 13.5-7 13.5Z" fill="currentColor" />
              <circle cx="8" cy="8" r="2.6" fill="#fff" />
            </g>
          </svg>
          <span className="hero-badge">
            <PinIcon size={12} className="hero-badge-pin" />
            DISCOVER KOREA
          </span>
          <h1>여행 플래너</h1>
          <p className="hero-subtitle">취향에 맞는 최적의 여행 동선을 제안해드려요</p>
          <div className="tab-row">
            <button
              type="button"
              className={`tab-btn${activeTab === 'search' ? ' active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              검색
            </button>
            <button
              type="button"
              className={`tab-btn${activeTab === 'recommended' ? ' active' : ''}`}
              onClick={() => setActiveTab('recommended')}
            >
              추천 관광지
            </button>
            <button
              type="button"
              className={`tab-btn${activeTab === 'favorites' ? ' active' : ''}`}
              onClick={() => setActiveTab('favorites')}
            >
              즐겨찾기
            </button>
          </div>
          {activeTab === 'search' && (
            <SearchBar
              onSearch={handleSearch}
              loading={loading}
              history={history}
              onSelectHistory={handleSearch}
              onRemoveHistory={removeFromHistory}
              historyEnabled={historyEnabled}
              onToggleHistoryEnabled={toggleHistoryEnabled}
            />
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="route-card">
          <div className="section-label">
            방문 순서 ({selectedPlaces.length}곳 선택됨)
          </div>
          <SelectedRoute
            selectedPlaces={selectedPlaces}
            onRemove={handleRemove}
            onMove={handleMove}
          />
        </div>

        <div className="saved-route-trigger">
          {selectedPlaces.length > 0 && (
            <form className="saved-route-save-form" onSubmit={handleSaveRoute}>
              <input
                type="text"
                placeholder="동선 이름"
                value={routeNameInput}
                onChange={(e) => setRouteNameInput(e.target.value)}
              />
              <button type="submit">동선 저장</button>
            </form>
          )}
          <button type="button" className="saved-route-list-btn" onClick={() => setShowSavedRoutes(true)}>
            저장된 동선{savedRoutes.length > 0 ? ` (${savedRoutes.length})` : ''}
          </button>
          <SavedRoutesPanel
            visible={showSavedRoutes}
            onClose={() => setShowSavedRoutes(false)}
            routes={savedRoutes}
            onLoadRoute={handleLoadRoute}
            onDeleteRoute={deleteRoute}
            onRenameRoute={renameRoute}
          />
        </div>

        {selectedPlaces.length >= 2 && (
          <div className="route-detail-trigger">
            <button type="button" className="route-detail-btn" onClick={() => setShowRouteDetail(true)}>
              길찾기 (상세 경로 보기)
            </button>
            <RouteDetailPanel
              visible={showRouteDetail}
              onClose={() => setShowRouteDetail(false)}
              mode={routeMode}
              legs={routeData?.legs}
              distanceMeters={routeData?.distanceMeters}
              durationSeconds={routeData?.durationSeconds}
              fareWon={routeData?.fareWon}
              loading={routeLoading}
              error={routeError}
              transitColors={transitColors}
            />
          </div>
        )}

        {activeTab === 'search' && (
          <>
            <div className="section-label">검색 결과</div>
            <PlaceList
              places={places}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              expandedId={focusPlace?.id ?? null}
              onToggleExpand={handleToggleExpand}
              lists={lists}
              favoriteIds={favoriteIds}
              onTogglePlaceInList={togglePlaceInList}
              onCreateList={createList}
            />
          </>
        )}

        {activeTab === 'recommended' && (
          <RecommendedPlaces
            selectedIds={selectedIds}
            onToggle={handleToggle}
            expandedId={focusPlace?.id ?? null}
            onToggleExpand={handleToggleExpand}
            previewScaleKm={previewScaleKm}
            onPreviewScaleKmChange={setPreviewScaleKm}
            onPreviewPlacesChange={setPreviewPlaces}
            lists={lists}
            favoriteIds={favoriteIds}
            onTogglePlaceInList={togglePlaceInList}
            onCreateList={createList}
          />
        )}

        {activeTab === 'favorites' && (
          <FavoriteLists
            lists={lists}
            favoriteIds={favoriteIds}
            onTogglePlaceInList={togglePlaceInList}
            onCreateList={createList}
            onDeleteList={deleteList}
            onRenameList={renameList}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            expandedId={focusPlace?.id ?? null}
            onToggleExpand={handleToggleExpand}
          />
        )}
      </aside>

      <main className="map-area">
        <KakaoMap
          selectedPlaces={selectedPlaces}
          previewPlaces={previewPlaces}
          previewScaleKm={previewScaleKm}
          onToggle={handleToggle}
          focusPlace={focusPlace}
          routeMode={routeMode}
          onRouteModeChange={setRouteMode}
          routeSegments={buildRouteSegments(routeData, routeMode, transitColors)}
          routeLoading={routeLoading}
          routeInfo={
            routeData
              ? {
                  distanceMeters: routeData.distanceMeters,
                  durationSeconds: routeData.durationSeconds,
                  fareWon: routeData.fareWon,
                }
              : null
          }
          routeError={routeError}
        />
      </main>
    </div>
  );
}
