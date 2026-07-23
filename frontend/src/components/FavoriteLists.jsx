import { useState } from 'react';
import PlaceList from './PlaceList.jsx';

export default function FavoriteLists({
  lists,
  favoriteIds,
  onTogglePlaceInList,
  onCreateList,
  onDeleteList,
  onRenameList,
  selectedIds,
  dayById,
  activeDay,
  onToggle,
  expandedId,
  onToggleExpand,
}) {
  const [activeListId, setActiveListId] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const activeList = lists.find((l) => l.id === activeListId);

  function handleCreate(e) {
    e.preventDefault();
    if (!newListName.trim()) return;
    onCreateList(newListName.trim());
    setNewListName('');
  }

  function handleRenameSubmit(e, listId) {
    e.preventDefault();
    onRenameList(listId, renameValue);
    setRenamingId(null);
  }

  if (activeList) {
    return (
      <div>
        <button type="button" className="favorite-list-back" onClick={() => setActiveListId(null)}>
          ← 목록으로
        </button>
        <div className="section-label">
          {activeList.name} ({activeList.places.length}곳)
        </div>
        <PlaceList
          places={activeList.places}
          selectedIds={selectedIds}
          dayById={dayById}
          activeDay={activeDay}
          onToggle={onToggle}
          expandedId={expandedId}
          onToggleExpand={onToggleExpand}
          lists={lists}
          favoriteIds={favoriteIds}
          onTogglePlaceInList={onTogglePlaceInList}
          onCreateList={onCreateList}
          emptyMessage="이 목록에 담긴 장소가 없습니다."
        />
      </div>
    );
  }

  return (
    <div>
      <form className="favorite-list-create" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="새 목록 이름"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
        <button type="submit">만들기</button>
      </form>
      <ul className="favorite-list-grid">
        {lists.map((list) => (
          <li key={list.id} className="favorite-list-card">
            {renamingId === list.id ? (
              <form className="favorite-list-rename-form" onSubmit={(e) => handleRenameSubmit(e, list.id)}>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => setRenamingId(null)}
                />
              </form>
            ) : (
              <button type="button" className="favorite-list-card-btn" onClick={() => setActiveListId(list.id)}>
                <div className="favorite-list-card-name">{list.name}</div>
                <div className="favorite-list-card-count">{list.places.length}곳</div>
              </button>
            )}
            <div className="favorite-list-card-actions">
              <button
                type="button"
                title="이름 변경"
                onClick={() => {
                  setRenamingId(list.id);
                  setRenameValue(list.name);
                }}
              >
                ✎
              </button>
              {list.id !== 'default' && (
                <button type="button" title="목록 삭제" onClick={() => onDeleteList(list.id)}>
                  🗑
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
