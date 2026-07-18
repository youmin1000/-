import { useState } from 'react';

export default function SearchBar({ onSearch, loading, history, onSelectHistory, onRemoveHistory }) {
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
      {showHistory && history && history.length > 0 && (
        <div className="search-history-dropdown">
          <div className="search-history-header">최근 검색어</div>
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
        </div>
      )}
    </div>
  );
}
