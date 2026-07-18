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

function getFetchTargets(region) {
  const regionData = RECOMMENDED_PLACES[region];
  if (isDistrictedRegion(regionData)) {
    const targets = [];
    regionData.__districts.forEach((gu) => {
      EAGER_CATEGORY_KEYS.forEach((cat) => targets.push({ district: gu, category: cat }));
    });
    return targets;
  }
  return EAGER_CATEGORY_KEYS.map((cat) => ({ district: null, category: cat }));
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

function buildAllDistrictsGroups(region, districts, category, cache) {
  const merged = [];
  districts.forEach((gu) => {
    const guGroups = cache[cacheKeyFor(region, gu, category)];
    if (!guGroups) return;
    guGroups.forEach((group) => {
      merged.push({
        area: group.area ? `${gu} · ${group.area}` : gu,
        places: group.places,
      });
    });
  });
  return merged;
}

export default function RecommendedPlaces({
  selectedIds,
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

  // 지도 미리보기 + 각 구/카테고리 조합을 백그라운드에서 한 번씩만 로드
  useEffect(() => {
    getFetchTargets(region).forEach(({ district: gu, category: cat }) => {
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

  // 실시간 카테고리(카페/실내/야외)는 현재 보고 있는 지역/구 조합만 그때그때 불러온다.
  // 전체(모든 구) 선택 시에는 구별로 나누지 않고 지역 전체를 한 번에 넓은 반경으로 검색한다.
  useEffect(() => {
    if (!LIVE_CATEGORIES.includes(category)) return;

    const gu = districted && district !== ALL_DISTRICTS ? district : null;
    const key = cacheKeyFor(region, gu, category);
    if (fetchedKeysRef.current.has(key)) return;
    fetchedKeysRef.current.add(key);

    searchNearby(region, gu, category)
      .then((places) => {
        const withCategory = places.map((p) => ({ ...p, listCategory: category }));
        setCache((prev) => ({ ...prev, [key]: [{ area: null, places: withCategory }] }));
      })
      .catch((err) => {
        console.error(err);
        setErrorKeys((prev) => ({ ...prev, [key]: true }));
      });
  }, [region, district, category, districted]);

  // cache가 갱신될 때마다 전 구/카테고리 미리보기 목록을 상위로 전달
  useEffect(() => {
    const merged = new Map();
    getFetchTargets(region).forEach(({ district: gu, category: cat }) => {
      const groups = cache[cacheKeyFor(region, gu, cat)];
      if (!groups) return;
      groups.forEach((group) => {
        group.places.forEach((place) => {
          if (!merged.has(place.id)) merged.set(place.id, place);
        });
      });
    });
    // 실시간 카테고리는 지역 전체를 미리 훑지 않으므로, 지금 캐시에 있는(=이미 조회해본)
    // 실시간 카테고리 결과도 함께 미리보기에 포함시킨다.
    LIVE_CATEGORIES.forEach((cat) => {
      [null, ...(districted ? regionData.__districts : [])].forEach((gu) => {
        const groups = cache[cacheKeyFor(region, gu, cat)];
        if (!groups) return;
        groups.forEach((group) => {
          group.places.forEach((place) => {
            if (!merged.has(place.id)) merged.set(place.id, place);
          });
        });
      });
    });
    onPreviewPlacesChange(Array.from(merged.values()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, region]);

  function handleRegionChange(nextRegion) {
    setRegion(nextRegion);
    setDistrict(ALL_DISTRICTS);
  }

  const isLive = LIVE_CATEGORIES.includes(category);

  let groups;
  let loading;
  let errorKey;
  if (districted && district === ALL_DISTRICTS && !isLive) {
    loading = regionData.__districts.some(
      (gu) => cache[cacheKeyFor(region, gu, category)] === undefined
    );
    groups = buildAllDistrictsGroups(region, regionData.__districts, category, cache);
    errorKey = cacheKeyFor(region, district, category);
  } else {
    const gu = districted && district !== ALL_DISTRICTS ? district : null;
    const key = cacheKeyFor(region, gu, category);
    groups = cache[key];
    loading = !groups && !errorKeys[key];
    errorKey = key;
  }
  const error = errorKeys[errorKey] ? '추천 관광지를 불러오는 중 오류가 발생했습니다.' : null;

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
        {CATEGORY_KEYS.map((c) => {
          const isActive = category === c;
          const color = colorFor(c);
          return (
            <button
              key={c}
              type="button"
              className={`tab-btn category-tab-btn${isActive ? ' active' : ''}`}
              style={
                isActive
                  ? { background: color, borderColor: color, color: '#fff' }
                  : undefined
              }
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
