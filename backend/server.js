import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const TMAP_APP_KEY = process.env.TMAP_APP_KEY;
const ODSAY_API_KEY = process.env.ODSAY_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

if (!KAKAO_REST_API_KEY) {
  console.error('KAKAO_REST_API_KEY가 .env 파일에 설정되어 있지 않습니다.');
  process.exit(1);
}

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const kakaoClient = axios.create({
  baseURL: 'https://dapi.kakao.com',
  headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
});

const kakaoMobilityClient = axios.create({
  baseURL: 'https://apis-navi.kakaomobility.com',
  headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
});

const tmapClient = axios.create({
  baseURL: 'https://apis.openapi.sk.com',
  headers: { appKey: TMAP_APP_KEY, Accept: 'application/json' },
});

// ODsay는 발급 시 등록한 URI를 Referer 헤더로 검증하므로, 서버에서 호출할 때도 명시적으로 채워준다.
const odsayClient = axios.create({
  baseURL: 'https://api.odsay.com',
  headers: { Referer: `http://localhost:${PORT}` },
});

// 카카오모빌리티 길찾기는 경유지를 최대 5개까지만 허용 (출발지+경유지5+도착지 = 7개)
const MAX_POINTS_PER_REQUEST = 7;

// vertexes: [lng1, lat1, lng2, lat2, ...] 형태의 평탄화된 배열을 좌표 객체 배열로 변환
function verticesToPath(vertexes) {
  const path = [];
  for (let i = 0; i < vertexes.length; i += 2) {
    path.push({ lng: vertexes[i], lat: vertexes[i + 1] });
  }
  return path;
}

async function fetchDirectionsChunk(points) {
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1);

  const params = {
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority: 'RECOMMEND',
  };
  if (waypoints.length > 0) {
    params.waypoints = waypoints.map((p) => `${p.lng},${p.lat}`).join('|');
  }

  const response = await kakaoMobilityClient.get('/v1/directions', { params });
  const route = response.data.routes && response.data.routes[0];

  if (!route || route.result_code !== 0) {
    const message = route?.result_msg || '경로를 찾을 수 없습니다.';
    throw new Error(message);
  }

  const path = route.sections.flatMap((section) =>
    section.roads.flatMap((road) => verticesToPath(road.vertexes))
  );

  // section 하나가 (연속된) 두 지점 사이의 한 구간에 대응된다.
  const legs = route.sections.map((section, i) => ({
    fromName: points[i].name || null,
    toName: points[i + 1].name || null,
    distanceMeters: section.distance,
    durationSeconds: section.duration,
    steps: (section.guides || [])
      .map((g) => ({ instruction: g.guidance || g.name || '', distanceMeters: g.distance }))
      .filter((s) => s.instruction),
  }));

  return {
    distanceMeters: route.summary.distance,
    durationSeconds: route.summary.duration,
    path,
    legs,
  };
}

function requireTmapKey() {
  if (!TMAP_APP_KEY) {
    throw new Error('TMAP_APP_KEY가 .env 파일에 설정되어 있지 않습니다.');
  }
}

// TMAP 보행자(도보) 경로안내: 한 번에 두 지점(출발-도착)만 지원하므로 구간별로 호출한다.
async function fetchPedestrianLeg(origin, destination) {
  requireTmapKey();

  const response = await tmapClient.post(
    '/tmap/routes/pedestrian',
    {
      startX: String(origin.lng),
      startY: String(origin.lat),
      endX: String(destination.lng),
      endY: String(destination.lat),
      startName: origin.name || '출발',
      endName: destination.name || '도착',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
    },
    { params: { version: 1 } }
  );

  const features = response.data.features || [];
  const summary = features.find((f) => f.geometry?.type === 'Point');

  if (!summary) {
    throw new Error(
      `${origin.name || '출발지'} → ${destination.name || '도착지'} 구간의 도보 경로를 찾을 수 없습니다.`
    );
  }

  const path = features
    .filter((f) => f.geometry?.type === 'LineString')
    .flatMap((f) => f.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })));

  // 턴바이턴 안내: 요약(summary)을 제외한 Point 피처마다 description(안내문구)이 담겨 있다.
  const steps = features
    .filter((f) => f.geometry?.type === 'Point' && f !== summary)
    .map((f) => ({ instruction: f.properties.description || '', distanceMeters: f.properties.distance ?? 0 }))
    .filter((s) => s.instruction);

  return {
    distanceMeters: summary.properties.totalDistance,
    durationSeconds: summary.properties.totalTime,
    path,
    steps,
  };
}

// TMAP 대중교통 경로안내: 마찬가지로 두 지점 단위이므로 구간별로 호출한다.
async function fetchTransitLeg(origin, destination) {
  requireTmapKey();

  const response = await tmapClient.post('/transit/routes', {
    startX: String(origin.lng),
    startY: String(origin.lat),
    endX: String(destination.lng),
    endY: String(destination.lat),
    count: 1,
    lang: 0,
    format: 'json',
  });

  const itinerary = response.data.metaData?.plan?.itineraries?.[0];

  if (!itinerary) {
    throw new Error(
      `${origin.name || '출발지'} → ${destination.name || '도착지'} 구간의 대중교통 경로를 찾을 수 없습니다.`
    );
  }

  const parseLinestring = (linestring) =>
    (linestring || '').split(' ').filter(Boolean).map((pair) => {
      const [lng, lat] = pair.split(',').map(Number);
      return { lng, lat };
    });

  // 버스/지하철 등 대중교통 구간은 노선명(route)·정류장 정보와 함께, 구간별 좌표(path)도
  // 따로 담아 전달한다 — 프론트에서 도보/버스/지하철 구간을 색으로 구분해 그릴 수 있도록.
  const steps = itinerary.legs.map((leg) => ({
    mode: leg.mode,
    routeName: leg.route || null,
    routeColor: leg.routeColor || null,
    startName: leg.start?.name || null,
    endName: leg.end?.name || null,
    stationCount: leg.passStopList?.stationList?.length || null,
    distanceMeters: leg.distance,
    durationSeconds: leg.sectionTime,
    path: parseLinestring(leg.passShape?.linestring),
  }));

  const path = steps.flatMap((step) => step.path);

  return {
    distanceMeters: itinerary.totalDistance,
    durationSeconds: itinerary.totalTime,
    fareWon: itinerary.fare?.regular?.totalFare ?? null,
    path,
    steps,
  };
}

// ODsay 대중교통 경로안내: TMAP이 쿼터 초과 등으로 실패할 때의 폴백으로 사용한다.
// ODsay는 구간별 상세 좌표(linestring)를 기본 응답에 주지 않아, 경유 정류장 좌표(있으면)
// 또는 구간 시작/끝 좌표로 대체한다 — TMAP만큼 도로를 정밀히 따라가진 않지만 충분히 사용 가능하다.
async function fetchTransitLegOdsay(origin, destination) {
  if (!ODSAY_API_KEY) {
    throw new Error('ODSAY_API_KEY가 .env 파일에 설정되어 있지 않습니다.');
  }

  const response = await odsayClient.get('/v1/api/searchPubTransPathT', {
    params: {
      apiKey: ODSAY_API_KEY,
      SX: origin.lng,
      SY: origin.lat,
      EX: destination.lng,
      EY: destination.lat,
    },
  });

  if (response.data.error) {
    // ODsay 에러 형식이 하나로 고정되어 있지 않다: 배열([{code,message}])일 때도,
    // 단일 객체({code,msg})일 때도 있어 둘 다 확인한다.
    const errorObj = Array.isArray(response.data.error) ? response.data.error[0] : response.data.error;
    const message = errorObj?.message || errorObj?.msg;
    if (!message) {
      console.error('ODsay 오류 응답(형식 미확인):', JSON.stringify(response.data));
    }
    const err = new Error(message || 'ODsay 대중교통 경로 조회에 실패했습니다.');
    err.odsayCode = errorObj?.code;
    throw err;
  }

  const route = response.data.result?.path?.[0];

  if (!route) {
    throw new Error(
      `${origin.name || '출발지'} → ${destination.name || '도착지'} 구간의 대중교통 경로를 찾을 수 없습니다.`
    );
  }

  const TRAFFIC_TYPE_MODE = { 1: 'SUBWAY', 2: 'BUS' };

  const steps = (route.subPath || []).map((sp) => {
    const mode = TRAFFIC_TYPE_MODE[sp.trafficType] || 'WALK';
    const stations = sp.passStopList?.stations;
    const lane = Array.isArray(sp.lane) ? sp.lane[0] : sp.lane;
    // 지하철은 lane.name(호선명), 버스는 lane.busNo(버스 번호)에 노선 정보가 들어있다.
    const routeName = lane?.name || lane?.busNo || null;

    const path =
      stations && stations.length > 0
        ? stations.map((st) => ({ lat: Number(st.y), lng: Number(st.x) }))
        : [
            { lat: sp.startY, lng: sp.startX },
            { lat: sp.endY, lng: sp.endX },
          ].filter((p) => p.lat != null && p.lng != null);

    return {
      mode,
      routeName,
      routeColor: null,
      startName: sp.startName || null,
      endName: sp.endName || null,
      stationCount: sp.stationCount ?? (stations ? stations.length : null),
      distanceMeters: sp.distance ?? 0,
      durationSeconds: (sp.sectionTime ?? 0) * 60, // ODsay는 분 단위
      path,
    };
  });

  return {
    distanceMeters: route.info.totalDistance,
    durationSeconds: route.info.totalTime * 60, // ODsay는 분 단위
    fareWon: route.info.payment ?? null,
    path: steps.flatMap((s) => s.path),
    steps,
  };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// 대중교통 API들은 출발/도착이 너무 가까우면(같은 건물 등) 경로를 못 찾고 에러를 낸다.
// ODsay는 직접 "출발/도착지가 700m 이내입니다"(code -98)로 거부하는 것을 확인했다.
// 이 정도 거리는 대중교통을 탈 이유가 없으므로 API 호출 없이 도보 구간으로 대체한다.
const MIN_TRANSIT_DISTANCE_METERS = 750;
const WALK_SPEED_MPS = 1.1; // 평균 도보 속도(약 4km/h)

function buildShortWalkLeg(origin, destination) {
  const distanceMeters = haversineMeters(origin, destination);
  const durationSeconds = Math.max(60, Math.round(distanceMeters / WALK_SPEED_MPS));
  const path = [
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
  ];

  return {
    distanceMeters,
    durationSeconds,
    path,
    steps: [
      {
        mode: 'WALK',
        routeName: null,
        routeColor: null,
        startName: origin.name || null,
        endName: destination.name || null,
        stationCount: null,
        distanceMeters,
        durationSeconds,
        path,
      },
    ],
  };
}

// TMAP을 우선 시도하고, 실패하면(쿼터 초과 등) ODsay로 재시도한다.
async function fetchTransitLegWithFallback(origin, destination) {
  if (haversineMeters(origin, destination) < MIN_TRANSIT_DISTANCE_METERS) {
    return buildShortWalkLeg(origin, destination);
  }

  try {
    return await fetchTransitLeg(origin, destination);
  } catch (err) {
    console.error('TMAP 대중교통 실패, ODsay로 폴백:', err.response?.data || err.message);
    try {
      return await fetchTransitLegOdsay(origin, destination);
    } catch (odsayErr) {
      console.error('ODsay도 실패:', odsayErr.response?.data || odsayErr.message);
      // "출발/도착지가 너무 가까움"(-98)은 사전 거리 체크를 통과했더라도 실제로는
      // 대중교통을 탈 이유가 없는 구간이라는 뜻이므로 에러 대신 도보로 대체한다.
      if (odsayErr.odsayCode === '-98') {
        return buildShortWalkLeg(origin, destination);
      }
      throw odsayErr;
    }
  }
}

// 도보/대중교통은 경유지 개념이 없으므로 구간(연속된 두 지점)별로 순차 호출해 이어붙인다.
async function fetchSequentialLegs(places, fetchLeg) {
  const legs = [];
  for (let i = 0; i < places.length - 1; i += 1) {
    const legResult = await fetchLeg(places[i], places[i + 1]);
    legs.push({
      fromName: places[i].name || null,
      toName: places[i + 1].name || null,
      distanceMeters: legResult.distanceMeters,
      durationSeconds: legResult.durationSeconds,
      fareWon: legResult.fareWon,
      steps: legResult.steps,
      path: legResult.path,
    });
  }

  const hasFare = legs.some((l) => l.fareWon != null);

  return {
    distanceMeters: legs.reduce((sum, l) => sum + l.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, l) => sum + l.durationSeconds, 0),
    path: legs.flatMap((l) => l.path),
    legs: legs.map(({ path, ...rest }) => rest),
    ...(hasFare ? { fareWon: legs.reduce((sum, l) => sum + (l.fareWon || 0), 0) } : {}),
  };
}

// 관광지 키워드 검색 (지역/도시명 -> 근처 관광명소 리스트)
app.get('/api/places/search', async (req, res) => {
  const { query, page = 1, category } = req.query;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
  }

  // category 파라미터를 안 주면 관광명소(AT4)로 기본 필터링.
  // 빈 문자열로 주면 필터 없이 검색 (문화시설 등 AT4 밖의 장소도 찾기 위함).
  const categoryGroupCode = category === undefined ? 'AT4' : category;

  try {
    const response = await kakaoClient.get('/v2/local/search/keyword.json', {
      params: {
        query,
        ...(categoryGroupCode ? { category_group_code: categoryGroupCode } : {}),
        size: 15,
        page,
      },
    });

    const places = response.data.documents.map((doc) => ({
      id: doc.id,
      name: doc.place_name,
      address: doc.road_address_name || doc.address_name,
      roadAddress: doc.road_address_name || null,
      lotAddress: doc.address_name || null,
      category: doc.category_name,
      phone: doc.phone,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      placeUrl: doc.place_url,
    }));

    res.json({
      places,
      meta: response.data.meta,
    });
  } catch (err) {
    console.error('Kakao API 오류:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '관광지 검색 중 오류가 발생했습니다.',
    });
  }
});

const REGION_CENTER_CACHE = new Map();

// 지역/구 이름(예: "서울 종로구")을 카카오 주소 검색으로 대표 좌표 하나로 변환한다.
// 행정구역 이름은 고정된 소수 집합이라 프로세스 생애주기 동안 메모리에 캐싱해도 충분하다.
async function geocodeCenter(label) {
  if (REGION_CENTER_CACHE.has(label)) return REGION_CENTER_CACHE.get(label);

  const response = await kakaoClient.get('/v2/local/search/address.json', {
    params: { query: label },
  });
  const doc = response.data.documents[0];

  if (!doc) {
    throw new Error(`"${label}" 위치를 찾을 수 없습니다.`);
  }

  const center = { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  REGION_CENTER_CACHE.set(label, center);
  return center;
}

// 카카오 로컬 API가 지원하는 카테고리만 매핑한다 — 팝업스토어/액티비티는
// 대응하는 카카오 카테고리가 없어 이 엔드포인트로는 검색할 수 없다.
const NEARBY_CATEGORY_CODES = { cafe: 'CE7', indoor: 'CT1', outdoor: 'AT4' };

// 카테고리 기반 주변 검색: 지역/구 이름을 좌표로 변환한 뒤, 그 좌표 반경 안에서
// 카카오 카테고리 검색(category.json)으로 실제 등록된 장소를 실시간으로 가져온다.
app.get('/api/places/nearby', async (req, res) => {
  const { region, district, category } = req.query;

  if (!region || !category) {
    return res.status(400).json({ error: 'region, category 파라미터가 필요합니다.' });
  }

  const categoryGroupCode = NEARBY_CATEGORY_CODES[category];
  if (!categoryGroupCode) {
    return res.status(400).json({ error: 'category는 cafe, indoor, outdoor 중 하나여야 합니다.' });
  }

  const label = district ? `${region} ${district}` : region;
  // 특정 구처럼 좁은 범위는 5km, 지역 전체처럼 넓은 범위는 카카오 최대치인 20km로 검색한다.
  const radius = district ? 5000 : 20000;

  try {
    const center = await geocodeCenter(label);

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        kakaoClient.get('/v2/local/search/category.json', {
          params: {
            category_group_code: categoryGroupCode,
            x: center.lng,
            y: center.lat,
            radius,
            page,
            size: 15,
          },
        })
      )
    );

    const seen = new Set();
    const places = [];
    pages.forEach((response) => {
      response.data.documents.forEach((doc) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        places.push({
          id: doc.id,
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
          roadAddress: doc.road_address_name || null,
          lotAddress: doc.address_name || null,
          category: doc.category_name,
          phone: doc.phone,
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
          placeUrl: doc.place_url,
        });
      });
    });

    res.json({ places, meta: { center, radius } });
  } catch (err) {
    console.error('주변 검색 오류:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '주변 장소 검색 중 오류가 발생했습니다.',
    });
  }
});

// 방문 순서를 실제 경로(자동차/도보/대중교통)로 계산
app.post('/api/directions', async (req, res) => {
  const { places, mode = 'car' } = req.body;

  if (!Array.isArray(places) || places.length < 2) {
    return res.status(400).json({ error: '2곳 이상의 장소가 필요합니다.' });
  }
  if (!['car', 'walk', 'transit'].includes(mode)) {
    return res.status(400).json({ error: 'mode는 car, walk, transit 중 하나여야 합니다.' });
  }

  try {
    let result;

    if (mode === 'car') {
      // 카카오모빌리티는 경유지 제한(최대 5개)이 있어 구간을 나눠 여러 번 호출하고 이어붙인다.
      // 각 구간은 이전 구간의 마지막 지점을 공유해 경로가 끊기지 않게 한다.
      const chunks = [];
      const step = MAX_POINTS_PER_REQUEST - 1;
      for (let i = 0; i < places.length - 1; i += step) {
        chunks.push(places.slice(i, i + MAX_POINTS_PER_REQUEST));
      }

      const results = [];
      for (const chunk of chunks) {
        results.push(await fetchDirectionsChunk(chunk));
      }
      result = {
        distanceMeters: results.reduce((sum, r) => sum + r.distanceMeters, 0),
        durationSeconds: results.reduce((sum, r) => sum + r.durationSeconds, 0),
        path: results.flatMap((r) => r.path),
        legs: results.flatMap((r) => r.legs),
      };
    } else {
      result = await fetchSequentialLegs(places, mode === 'walk' ? fetchPedestrianLeg : fetchTransitLegWithFallback);
    }

    res.json(result);
  } catch (err) {
    console.error('길찾기 오류:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data ? '경로 계산 중 오류가 발생했습니다.' : err.message,
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`백엔드 서버 실행 중: http://localhost:${PORT}`);
});
