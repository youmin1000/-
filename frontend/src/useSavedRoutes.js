import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kr-travel-saved-routes';

function loadRoutes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useSavedRoutes() {
  const [routes, setRoutes] = useState(loadRoutes);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  }, [routes]);

  function saveRoute(name, places) {
    const trimmed = name.trim();
    if (!trimmed || places.length === 0) return;
    const id = `route-${Date.now()}`;
    setRoutes((prev) => [...prev, { id, name: trimmed, places, createdAt: Date.now() }]);
  }

  function deleteRoute(id) {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  }

  function renameRoute(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, name: trimmed } : r)));
  }

  return { routes, saveRoute, deleteRoute, renameRoute };
}
