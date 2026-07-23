import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const client = axios.create({
  baseURL: API_BASE_URL,
});

export async function searchPlaces(query, category) {
  const { data } = await client.get('/api/places/search', {
    params: { query, ...(category === undefined ? {} : { category }) },
  });
  return data.places;
}

export async function searchNearby(region, district, category) {
  const { data } = await client.get('/api/places/nearby', {
    params: { region, ...(district ? { district } : {}), category },
  });
  return data.places;
}

export async function getPlaceDetail(place) {
  const { data } = await client.get('/api/places/detail', {
    params: { name: place.name, lat: place.lat, lng: place.lng, address: place.address },
  });
  return data;
}

export function photoUrl(photoName, maxWidth = 400) {
  return `${API_BASE_URL}/api/places/photo?name=${encodeURIComponent(photoName)}&maxWidth=${maxWidth}`;
}

export async function getDirections(places, mode = 'car') {
  const { data } = await client.post('/api/directions', {
    places: places.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
    mode,
  });
  return data;
}

export async function createSharedRoute(name, places) {
  const { data } = await client.post('/api/routes/shared', { name, places });
  return data;
}

export async function getSharedRoute(shareId) {
  const { data } = await client.get(`/api/routes/shared/${shareId}`);
  return data;
}

// axios(XHR) 대신 fetch keepalive를 쓴다 — navigator.share()로 공유 시트가 뜨면서
// 페이지가 백그라운드로 전환되면, 일반 XHR/fetch 요청은 완료되기 전에 브라우저가
// 취소해버릴 수 있다. keepalive:true는 sendBeacon처럼 탭이 전환돼도 요청이 끝까지
// 전달되도록 브라우저가 보장해준다 (본문 용량이 작은 이 요청엔 문제없다).
export async function updateSharedRoute(shareId, { name, places, clientId }) {
  const res = await fetch(`${API_BASE_URL}/api/routes/shared/${shareId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, places, clientId }),
    keepalive: true,
  });
  if (!res.ok) {
    throw new Error(`공유 동선 저장 실패 (${res.status})`);
  }
  return res.json();
}

// http(s) API_BASE_URL을 같은 호스트의 ws(s) 주소로 바꿔준다 (별도 프론트 env 불필요).
export function buildSharedRouteWsUrl(shareId, clientId) {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws/routes?shareId=${encodeURIComponent(shareId)}&clientId=${encodeURIComponent(clientId)}`;
}
