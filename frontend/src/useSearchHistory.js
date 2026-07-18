import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kr-travel-search-history';
const MAX_HISTORY = 10;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState(loadHistory);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  function addToHistory(query) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory((prev) => [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, MAX_HISTORY));
  }

  function removeFromHistory(query) {
    setHistory((prev) => prev.filter((q) => q !== query));
  }

  function clearHistory() {
    setHistory([]);
  }

  return { history, addToHistory, removeFromHistory, clearHistory };
}
