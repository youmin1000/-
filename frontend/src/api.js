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
