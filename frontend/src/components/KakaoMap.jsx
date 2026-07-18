import { useEffect, useRef, useState } from 'react';
import { loadKakaoMaps } from '../loadKakaoMaps.js';
import { colorFor } from '../categoryColors.js';
import { formatDistance, formatDuration } from '../formatRoute.js';

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청 기본 좌표
const SCALE_BAR_REFERENCE_PX = 50; // 이 픽셀 길이가 나타내는 실제 거리를 "축척"으로 취급

const ROUTE_MODES = [
  { value: 'car', label: '자동차' },
  { value: 'walk', label: '도보' },
  { value: 'transit', label: '대중교통' },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildSelectedPinContent(place, index) {
  const content = document.createElement('div');
  content.className = 'kmap-pin-wrap';

  const pin = document.createElement('div');
  pin.className = 'kmap-pin';
  pin.style.background = colorFor(place.listCategory);
  const badge = document.createElement('span');
  badge.className = 'kmap-pin-badge';
  badge.textContent = String(index + 1);
  pin.appendChild(badge);

  const label = document.createElement('div');
  label.className = 'kmap-pin-label';
  label.textContent = place.name;

  content.appendChild(pin);
  content.appendChild(label);
  return content;
}

function buildPreviewPinContent(place, onClick) {
  const content = document.createElement('div');
  content.className = 'kmap-pin-wrap kmap-pin-wrap-mini';

  const dot = document.createElement('div');
  dot.className = 'kmap-pin-mini';
  dot.style.background = colorFor(place.listCategory);

  const label = document.createElement('div');
  label.className = 'kmap-pin-label kmap-pin-label-mini';
  label.textContent = place.name;

  content.appendChild(dot);
  content.appendChild(label);
  content.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(place);
  });
  return content;
}

export default function KakaoMap({
  selectedPlaces,
  previewPlaces,
  previewScaleKm,
  onToggle,
  focusPlace,
  routeMode,
  onRouteModeChange,
  routeSegments,
  routeLoading,
  routeInfo,
  routeError,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const previewMarkersRef = useRef([]);
  const focusMarkerRef = useRef(null);
  const idleDebounceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // 'idle' 리스너(맵 생성 시 한 번만 등록됨)가 항상 최신 props를 읽도록 ref에 보관
  const latestRef = useRef({});
  latestRef.current = { selectedPlaces, previewPlaces, previewScaleKm, onToggle };

  function updatePreviewPins() {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao || !map) return;

    previewMarkersRef.current.forEach((marker) => marker.setMap(null));
    previewMarkersRef.current = [];

    const {
      selectedPlaces: selected,
      previewPlaces: preview,
      previewScaleKm: scaleKmThreshold,
      onToggle: toggle,
    } = latestRef.current;

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const widthKm = haversineKm(sw.getLat(), sw.getLng(), sw.getLat(), ne.getLng());

    // 브라우저 창 크기와 무관하게 "실제 지도 축척"으로 비교하기 위해
    // 화면 폭이 아니라 SCALE_BAR_REFERENCE_PX(기준 픽셀 길이)당 km로 환산한다.
    const containerWidthPx = containerRef.current?.offsetWidth || 1;
    const scaleKm = (widthKm / containerWidthPx) * SCALE_BAR_REFERENCE_PX;

    if (scaleKm > scaleKmThreshold) return;

    const selectedIds = new Set(selected.map((p) => p.id));

    preview
      .filter((p) => !selectedIds.has(p.id))
      .filter((p) => bounds.contain(new kakao.maps.LatLng(p.lat, p.lng)))
      .forEach((place) => {
        const position = new kakao.maps.LatLng(place.lat, place.lng);
        const content = buildPreviewPinContent(place, toggle);
        const overlay = new kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 1,
        });
        overlay.setMap(map);
        previewMarkersRef.current.push(overlay);
      });
  }

  useEffect(() => {
    let cancelled = false;

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 8,
        });

        mapRef.current = map;
        kakao.maps.event.addListener(map, 'idle', () => {
          clearTimeout(idleDebounceRef.current);
          idleDebounceRef.current = setTimeout(updatePreviewPins, 200);
        });

        setMapReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
      clearTimeout(idleDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    // 기존 마커 제거
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    if (selectedPlaces.length === 0) {
      // 방문 순서가 비어도 지도 위치/줌은 그대로 유지 (기본 위치로 되돌리지 않음)
      updatePreviewPins();
      return;
    }

    const bounds = new kakao.maps.LatLngBounds();

    selectedPlaces.forEach((place, index) => {
      const position = new kakao.maps.LatLng(place.lat, place.lng);
      const content = buildSelectedPinContent(place, index);

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 0.72,
        xAnchor: 0.5,
        zIndex: 10,
      });
      overlay.setMap(map);

      markersRef.current.push(overlay);
      bounds.extend(position);
    });

    map.setBounds(bounds);
    updatePreviewPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, selectedPlaces]);

  // 실제 경로(routeSegments)가 준비되면 구간별 색상으로, 로딩 중이거나 없으면 직선으로 잇는다.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    polylinesRef.current.forEach((pl) => pl.setMap(null));
    polylinesRef.current = [];

    if (selectedPlaces.length < 2) return;

    const useRealPath = !routeLoading && routeSegments && routeSegments.length > 0;
    const segments = useRealPath
      ? routeSegments
      : [{ path: selectedPlaces, color: '#3b6ef6' }];

    segments.forEach((seg) => {
      if (!seg.path || seg.path.length === 0) return;
      const polyline = new kakao.maps.Polyline({
        path: seg.path.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 5,
        strokeColor: seg.color,
        strokeOpacity: 0.9,
        strokeStyle: useRealPath ? 'solid' : 'shortdash',
      });
      polyline.setMap(map);
      polylinesRef.current.push(polyline);
    });
  }, [mapReady, selectedPlaces, routeSegments, routeLoading]);

  // 미리보기 데이터/배율 설정이 바뀌면 지도 이동 없이도 다시 그리기
  useEffect(() => {
    if (!mapReady) return;
    updatePreviewPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, previewPlaces, previewScaleKm]);

  // 리스트에서 항목을 펼치면 그 위치로 지도를 이동하고 하이라이트 표시
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    if (focusMarkerRef.current) {
      focusMarkerRef.current.setMap(null);
      focusMarkerRef.current = null;
    }

    if (!focusPlace) return;

    const position = new kakao.maps.LatLng(focusPlace.lat, focusPlace.lng);
    map.panTo(position);
    if (map.getLevel() > 5) {
      map.setLevel(5);
    }

    const content = document.createElement('div');
    content.className = 'kmap-focus-ring';

    const overlay = new kakao.maps.CustomOverlay({
      position,
      content,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 20,
    });
    overlay.setMap(map);
    focusMarkerRef.current = overlay;
  }, [mapReady, focusPlace]);

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        지도를 불러오지 못했습니다: {loadError}
        <br />
        Kakao Developers 콘솔에 등록된 플랫폼 도메인(웹)이 현재 접속 주소와 일치하는지
        확인해주세요.
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {selectedPlaces.length >= 2 && (
        <div className="kmap-route-summary">
          <div className="kmap-route-modes">
            {ROUTE_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`kmap-route-mode-btn${routeMode === m.value ? ' active' : ''}`}
                onClick={() => onRouteModeChange(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="kmap-route-text">
            {routeLoading && '경로 계산 중...'}
            {!routeLoading && routeInfo && (
              <>
                총 {formatDistance(routeInfo.distanceMeters)} · 약{' '}
                {formatDuration(routeInfo.durationSeconds)}
                {routeInfo.fareWon != null && ` · ${routeInfo.fareWon.toLocaleString()}원`}
              </>
            )}
            {!routeLoading && routeError && routeError}
          </div>
        </div>
      )}
    </>
  );
}
