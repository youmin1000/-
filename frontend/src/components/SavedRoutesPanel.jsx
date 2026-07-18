import { useState } from 'react';

export default function SavedRoutesPanel({
  visible,
  onClose,
  routes,
  onLoadRoute,
  onDeleteRoute,
  onRenameRoute,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  if (!visible) return null;

  function handleRenameSubmit(e, routeId) {
    e.preventDefault();
    onRenameRoute(routeId, renameValue);
    setRenamingId(null);
  }

  return (
    <div className="route-detail-panel">
      <div className="route-detail-header">
        <span>저장된 동선</span>
        <button type="button" className="route-detail-close" onClick={onClose}>
          닫기
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="route-detail-status">저장된 동선이 없습니다.</div>
      ) : (
        <ul className="saved-route-list">
          {routes.map((route) => (
            <li key={route.id} className="saved-route-item">
              {renamingId === route.id ? (
                <form className="saved-route-rename-form" onSubmit={(e) => handleRenameSubmit(e, route.id)}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => setRenamingId(null)}
                  />
                </form>
              ) : (
                <button type="button" className="saved-route-name-btn" onClick={() => onLoadRoute(route)}>
                  <span className="saved-route-name">{route.name}</span>
                  <span className="saved-route-count">{route.places.length}곳</span>
                </button>
              )}
              <div className="saved-route-actions">
                <button
                  type="button"
                  title="이름 변경"
                  onClick={() => {
                    setRenamingId(route.id);
                    setRenameValue(route.name);
                  }}
                >
                  ✎
                </button>
                <button type="button" title="삭제" onClick={() => onDeleteRoute(route.id)}>
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
