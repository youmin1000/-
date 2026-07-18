import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kr-travel-favorite-lists';
const DEFAULT_LIST = { id: 'default', name: '즐겨찾기', places: [] };

function loadLists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.length > 0 ? parsed : [DEFAULT_LIST];
  } catch {
    return [DEFAULT_LIST];
  }
}

export function useFavorites() {
  const [lists, setLists] = useState(loadLists);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  }, [lists]);

  // 새 목록을 만들고, 장소가 함께 전달되면 바로 그 장소를 담아준다(별 버튼에서 "+ 새 목록"으로 추가할 때 사용).
  function createList(name, initialPlace) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `list-${Date.now()}`;
    setLists((prev) => [...prev, { id, name: trimmed, places: initialPlace ? [initialPlace] : [] }]);
  }

  function deleteList(id) {
    setLists((prev) => prev.filter((l) => l.id !== id));
  }

  function renameList(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l)));
  }

  function togglePlaceInList(listId, place) {
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        const exists = l.places.some((p) => p.id === place.id);
        return {
          ...l,
          places: exists ? l.places.filter((p) => p.id !== place.id) : [...l.places, place],
        };
      })
    );
  }

  // 어느 목록에든 하나라도 속해 있으면 별표를 채워서 보여준다.
  const favoriteIds = new Set(lists.flatMap((l) => l.places.map((p) => p.id)));

  return { lists, favoriteIds, createList, deleteList, renameList, togglePlaceInList };
}
