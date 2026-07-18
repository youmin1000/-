import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kr-travel-search-history';
const ENABLED_KEY = 'kr-travel-search-history-enabled';
const MAX_HISTORY = 10;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadEnabled() {
  const raw = localStorage.getItem(ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export function useSearchHistory() {
  const [history, setHistory] = useState(loadHistory);
  const [enabled, setEnabled] = useState(loadEnabled);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  }, [enabled]);

  function addToHistory(query) {
    if (!enabled) return;
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

  function toggleEnabled() {
    setEnabled((prev) => !prev);
  }

  return { history, addToHistory, removeFromHistory, clearHistory, enabled, toggleEnabled };
}
