import { useEffect, useRef, useState } from 'react';
import {
  RECOMMENDED_PLACES,
  REGIONS,
  CATEGORY_LABELS,
  CATEGORY_KEYS,
  isItemActive,
  isDistrictedRegion,
} from '../data/recommendedPlaces.js';
import { colorFor } from '../categoryColors.js';
import { searchPlaces, searchNearby } from '../api.js';
import PlaceList from './PlaceList.jsx';

const SCALE_OPTIONS_KM = [0.5, 1, 2, 4];
const ALL_DISTRICTS = '전체';
const ALL_CATEGORY = '전체';
const CATEGORY_TABS = [ALL_CATEGORY, ...CATEGORY_KEYS];

// 카카오 로컬 API에 대응하는 카테고리 코드가 있는 것들 — 이 카테고리는 큐레이션 대신
// 실시간 주변검색(/api/places/nearby)으로 가져온다. 팝업스토어/액티비티는 카카오에
// 해당 카테고리가 없어 기존 큐레이션 데이터를 그대로 쓴다.
const LIVE_CATEGORIES = ['cafe', 'indoor', 'outdoor'];
// 백그라운드 미리보기 선로딩은 큐레이션 카테고리에만 적용한다 — 실시간 카테고리까지
// 지역의 구마다 미리 불러오면 API 호출이 지역당 수십 건으로 늘어난다.
const EAGER_CATEGORY_KEYS = CATEGORY_KEYS.filter((c) => !LIVE_CATEGORIES.includes(c));

function formatScaleLabel(km) {
  return km < 1 ? `${km * 1000}m` : `${km}km`;
}

function getRawGroups(region, district, category) {
  const regionData = RECOMMENDED_PLACES[region];
  if (isDistrictedRegion(regionData)) {
    return regionData.districts[district]?.[category] || [];
  }
  return regionData[category] || [];
}

function allDistrictsOf(region) {
  const regionData = RECOMMENDED_PLACES[region];
  return isDistrictedRegion(regionData) ? regionData.__districts : [null];
}

// 구를 '전체'로 보고 있으면 그 지역의 모든 구를, 특정 구를 보고 있으면 그 구 하나만 대상으로 한다.
function districtsInScope(region, selectedDistrict) {
  if (selectedDistrict === ALL_DISTRICTS) return allDistrictsOf(region);
  const regionData = RECOMMENDED_PLACES[region];
  return isDistrictedRegion(regionData) ? [selectedDistrict] : [null];
}

// 지도 미리보기용 배경 선로딩 대상: 탭/구 선택과 무관하게 현재 지역의
// 모든 구 × 큐레이션 카테고리 전부를 대상으로 한다.
function getEagerTargets(region) {
  const targets = [];
  allDistrictsOf(region).forEach((gu) => {
    EAGER_CATEGORY_KEYS.forEach((cat) => targets.push({ district: gu, category: cat }));
  });
  return targets;
}

// 실시간 카테고리는 구별로 나누지 않는다 — 구를 '전체'로 보고 있을 땐 그 지역 전체를
// 한 번에 넓은 반경으로 검색한다(gu=null). 구마다 따로 호출하면 지역당 API 호출이
// 수십 건으로 늘어나기 때문에 큐레이션 카테고리와는 다르게 취급한다.
function liveDistrictsInScope(region, selectedDistrict) {
  if (!isDistrictedRegion(RECOMMENDED_PLACES[region])) return [null];
  if (selectedDistrict === ALL_DISTRICTS) return [null];
  return [selectedDistrict];
}

// 실시간 카테고리(카페/실내/야외)는 지금 실제로 보고 있는 범위만 그때그때 불러온다.
function getLiveTargets(region, selectedDistrict, selectedCategory) {
  const cats =
    selectedCategory === ALL_CATEGORY
      ? LIVE_CATEGORIES
      : LIVE_CATEGORIES.filter((c) => c === selectedCategory);
  if (cats.length === 0) return [];

  const targets = [];
  liveDistrictsInScope(region, selectedDistrict).forEach((gu) => {
    cats.forEach((cat) => targets.push({ district: gu, category: cat }));
  });
  return targets;
}

function cacheKeyFor(region, district, category) {
  return district ? `${region}:${district}:${category}` : `${region}:${category}`;
}

function searchLabelFor(region, district) {
  return district && district !== ALL_DISTRICTS ? `${region} ${district}` : region;
}

async function resolvePlace(searchLabel, entry) {
  const { name, note, displayName } = entry;

  // 이미 좌표/카테고리 등이 확정된 항목(대량 임포트 등)은 재검색 없이 그대로 사용한다.
  if (entry.lat !== undefined && entry.lng !== undefined && entry.id !== undefined) {
    return {
      ...entry,
      ...(displayName ? { name: displayName, id: `${entry.id}::${displayName}` } : {}),
    };
  }

  const results = await searchPlaces(`${searchLabel} ${name}`, ''); // 카테고리 필터 없이 검색
  if (results.length === 0) return null;

  const inRegion = results.filter((p) => p.address.includes(searchLabel.split(' ')[0]));
  const candidates = inRegion.length > 0 ? inRegion : results;

  const exact = candidates.find((p) => p.name === name);
  const contains = candidates.find((p) => p.name.includes(name) || name.includes(p.name));
  const match = exact || contains || candidates[0];

  return {
    ...match,
    note,
    // displayName이 있으면(같은 건물에 입점한 기간 한정 팝업 등) 실제 장소명 대신 그 이름을 보여주고,
    // id도 함께 구분해줘야 같은 장소를 가리키는 다른 팝업이 리스트 key/선택 상태에서 충돌하지 않는다.
    ...(displayName ? { name: displayName, id: `${match.id}::${displayName}` } : {}),
  };
}

async function resolveGroups(searchLabel, category, groups) {
  const resolved = await Promise.all(
    groups.map(async (group) => ({
      area: group.area,
      places: (
        await Promise.all(
          group.items.filter(isItemActive).map(async (entry) => {
            const place = await resolvePlace(searchLabel, entry);
            return place ? { ...place, listCategory: category } : null;
          })
        )
      ).filter(Boolean),
    }))
  );
  return resolved.filter((group) => group.places.length > 0);
}

// 현재 구/카테고리 선택(전체 포함)에 맞춰 실제로 화면에 그릴 그룹 목록을 만든다.
// 구가 '전체'면 구명을, 카테고리가 '전체'면 카테고리명을 그룹 라벨 앞에 덧붙여서
// 어디서 온 항목인지 구분할 수 있게 한다.
function buildDisplayGroups(region, selectedDistrict, selectedCategory, cache, errorKeys) {
  const categories = selectedCategory === ALL_CATEGORY ? CATEGORY_KEYS : [selectedCategory];
  const showCategoryLabel = selectedCategory === ALL_CATEGORY;
  const districted = isDistrictedRegion(RECOMMENDED_PLACES[region]);
  const merged = [];
  let loading = false;
  let hasError = false;

  categories.forEach((cat) => {
    const isLive = LIVE_CATEGORIES.includes(cat);
    // 실시간 카테고리는 구별로 나누지 않고 지역 전체를 한 번에 검색하므로 구 라벨이 의미 없다.
    const showDistrictLabel = !isLive && districted && selectedDistrict === ALL_DISTRICTS;
    const districts = isLive
      ? liveDistrictsInScope(region, selectedDistrict)
      : districtsInScope(region, selectedDistrict);

    districts.forEach((gu) => {
      const key = cacheKeyFor(region, gu, cat);
      const groups = cache[key];
      if (!groups) {
        if (errorKeys[key]) hasError = true;
        else loading = true;
        return;
      }
      groups.forEach((group) => {
        const labelParts = [];
        if (showDistrictLabel) labelParts.push(gu);
        if (showCategoryLabel) labelParts.push(CATEGORY_LABELS[cat] || cat);
        if (group.area) labelParts.push(group.area);
        merged.push({
          area: labelParts.length > 0 ? labelParts.join(' · ') : null,
          places: group.places,
        });
      });
    });
  });

  return { groups: merged, loading, error: hasError };
}

export default function RecommendedPlaces({
  selectedIds,
  dayById,
  activeDay,
  onToggle,
  expandedId,
  onToggleExpand,
  previewScaleKm,
  onPreviewScaleKmChange,
  onPreviewPlacesChange,
  lists,
  favoriteIds,
  onTogglePlaceInList,
  onCreateList,
}) {
  const [region, setRegion] = useState(REGIONS[0]);
  const [district, setDistrict] = useState(ALL_DISTRICTS);
  const [category, setCategory] = useState(CATEGORY_KEYS[0]);
  const [cache, setCache] = useState({}); // cacheKeyFor(...) -> resolved groups
  const [errorKeys, setErrorKeys] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fetchedKeysRef = useRef(new Set());

  const regionData = RECOMMENDED_PLACES[region];
  const districted = isDistrictedRegion(regionData);

  // 지도 미리보기용 큐레이션 카테고리 배경 선로딩 — 탭/구 선택과 무관하게
  // 현재 지역의 모든 구를 대상으로 한 번씩만 로드한다.
  useEffect(() => {
    getEagerTargets(region).forEach(({ district: gu, category: cat }) => {
      const key = cacheKeyFor(region, gu, cat);
      if (fetchedKeysRef.current.has(key)) return;
      fetchedKeysRef.current.add(key);

      const searchLabel = searchLabelFor(region, gu);
      resolveGroups(searchLabel, cat, getRawGroups(region, gu, cat))
        .then((resolvedGroups) => {
          setCache((prev) => ({ ...prev, [key]: resolvedGroups }));
        })
        .catch((err) => {
          console.error(err);
          setErrorKeys((prev) => ({ ...prev, [key]: true }));
        });
    });
  }, [region]);

  // 실시간 카테고리(카페/실내/야외)는 현재 실제로 보고 있는 구/카테고리 범위만 그때그때 불러온다.
  useEffect(() => {
    getLiveTargets(region, district, category).forEach(({ district: gu, category: cat }) => {
      const key = cacheKeyFor(region, gu, cat);
      if (fetchedKeysRef.current.has(key)) return;
      fetchedKeysRef.current.add(key);

      searchNearby(region, gu, cat)
        .then((places) => {
          const withCategory = places.map((p) => ({ ...p, listCategory: cat }));
          setCache((prev) => ({ ...prev, [key]: [{ area: null, places: withCategory }] }));
        })
        .catch((err) => {
          console.error(err);
          setErrorKeys((prev) => ({ ...prev, [key]: true }));
        });
    });
  }, [region, district, category]);

  // cache가 갱신될 때마다 현재 지역의 전 구/카테고리 미리보기 목록을 상위로 전달.
  // 큐레이션 카테고리는 구별로 저장되므로 모든 구를 순회하고, 실시간 카테고리는
  // null(지역 전체 검색) 또는 특정 구 키로 저장되므로 둘 다 확인한다.
  useEffect(() => {
    const merged = new Map();
    const addFrom = (key) => {
      const groups = cache[key];
      if (!groups) return;
      groups.forEach((group) => {
        group.places.forEach((place) => {
          if (!merged.has(place.id)) merged.set(place.id, place);
        });
      });
    };

    const guList = allDistrictsOf(region);
    EAGER_CATEGORY_KEYS.forEach((cat) => {
      guList.forEach((gu) => addFrom(cacheKeyFor(region, gu, cat)));
    });
    LIVE_CATEGORIES.forEach((cat) => {
      [null, ...guList.filter((gu) => gu !== null)].forEach((gu) => addFrom(cacheKeyFor(region, gu, cat)));
    });
    onPreviewPlacesChange(Array.from(merged.values()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, region]);

  function handleRegionChange(nextRegion) {
    setRegion(nextRegion);
    setDistrict(ALL_DISTRICTS);
  }

  const { groups, loading, error: hasError } = buildDisplayGroups(
    region,
    district,
    category,
    cache,
    errorKeys
  );
  const error = hasError ? '추천 관광지를 불러오는 중 오류가 발생했습니다.' : null;

  return (
    <div>
      <div className="region-select-row region-settings-row">
        <select value={region} onChange={(e) => handleRegionChange(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="settings-gear-btn"
          onClick={() => setSettingsOpen((v) => !v)}
          title="지도 미리보기 설정"
        >
          ⚙
        </button>
      </div>

      {districted && (
        <div className="region-select-row">
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value={ALL_DISTRICTS}>전체</option>
            {regionData.__districts.map((gu) => (
              <option key={gu} value={gu}>
                {gu}
              </option>
            ))}
          </select>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-popover">
          <div className="settings-popover-label">지도 미리보기 표시 배율</div>
          <div className="settings-scale-options">
            {SCALE_OPTIONS_KM.map((km) => (
              <button
                key={km}
                type="button"
                className={`scale-option-btn${previewScaleKm === km ? ' active' : ''}`}
                onClick={() => onPreviewScaleKmChange(km)}
              >
                {formatScaleLabel(km)}
              </button>
            ))}
          </div>
          <div className="settings-popover-hint">
            지도 확대 수준이 이 값 이하로 좁아지면 추천 관광지 전체가 핀으로 표시됩니다.
          </div>
        </div>
      )}

      <div className="tab-row category-tab-row">
        {CATEGORY_TABS.map((c) => {
          const isActive = category === c;
          const color = colorFor(c);
          return (
            <button
              key={c}
              type="button"
              className={`tab-btn category-tab-btn${isActive ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              <span className="tab-dot" style={{ background: color }} />
              {CATEGORY_LABELS[c] || c}
            </button>
          );
        })}
      </div>

      {loading && <div className="empty-state">추천 관광지를 불러오는 중...</div>}
      {error && <div className="error-banner">{error}</div>}
      {!loading && !error && groups && groups.length === 0 && (
        <div className="empty-state">아직 등록된 장소가 없습니다.</div>
      )}

      {!loading &&
        !error &&
        groups &&
        groups.map((group, idx) => (
          <div key={group.area || idx}>
            {group.area && <div className="group-label">{group.area}</div>}
            <PlaceList
              places={group.places}
              selectedIds={selectedIds}
              dayById={dayById}
              activeDay={activeDay}
              onToggle={onToggle}
              expandedId={expandedId}
              onToggleExpand={onToggleExpand}
              lists={lists}
              favoriteIds={favoriteIds}
              onTogglePlaceInList={onTogglePlaceInList}
              onCreateList={onCreateList}
            />
          </div>
        ))}
    </div>
  );
}
