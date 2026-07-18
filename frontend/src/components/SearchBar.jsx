import { useState } from 'react';

export default function SearchBar({
  onSearch,
  loading,
  history,
  onSelectHistory,
  onRemoveHistory,
  historyEnabled,
  onToggleHistoryEnabled,
}) {
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query.trim());
    setShowHistory(false);
  }

  function handleHistoryClick(term) {
    setQuery(term);
    onSelectHistory(term);
    setShowHistory(false);
  }

  return (
    <div className="search-bar-wrap">
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="지역/도시명 입력 (예: 경주, 부산 해운대)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 150)}
        />
        <button type="submit" disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {showHistory && (
        <div className="search-history-panel">
          <div className="search-history-panel-header">
            <span className="search-history-header">최근 검색어</span>
          </div>

          {historyEnabled ? (
            history && history.length > 0 ? (
              <ul className="search-history-list">
                {history.map((term) => (
                  <li key={term} className="search-history-item">
                    <button
                      type="button"
                      className="search-history-term"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleHistoryClick(term)}
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      className="search-history-remove"
                      title="기록 삭제"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRemoveHistory(term)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="search-history-empty">최근 검색어가 없습니다.</div>
            )
          ) : (
            <div className="search-history-empty">검색기록이 꺼져있습니다.</div>
          )}

          <button
            type="button"
            className="search-history-toggle-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleHistoryEnabled}
          >
            {historyEnabled ? '검색기록 끄기' : '검색기록 켜기'}
          </button>
        </div>
      )}
    </div>
  );
}
