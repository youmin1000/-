import { useState } from 'react';

function PlaceDetailContent({ place }) {
  const showLotAddressSeparately = place.lotAddress && place.lotAddress !== place.roadAddress;

  return (
    <div className="place-detail-content">
      <div className="detail-row">
        <span className="detail-label">도로명</span>
        <span>{place.roadAddress || place.address || '정보 없음'}</span>
      </div>
      {showLotAddressSeparately && (
        <div className="detail-row">
          <span className="detail-label">지번</span>
          <span>{place.lotAddress}</span>
        </div>
      )}
      <div className="detail-row">
        <span className="detail-label">전화번호</span>
        <span>{place.phone || '정보 없음'}</span>
      </div>
      {place.note && (
        <div className="detail-row">
          <span className="detail-label">메모</span>
          <span>{place.note}</span>
        </div>
      )}
      {place.placeUrl && (
        <a
          className="detail-kakao-link"
          href={place.placeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          카카오맵에서 상세보기 (사진·영업시간·리뷰)
        </a>
      )}
    </div>
  );
}

function FavoriteMenu({ place, lists, onTogglePlaceInList, onCreateList }) {
  const [newListName, setNewListName] = useState('');

  function handleCreateAndAdd(e) {
    e.preventDefault();
    if (!newListName.trim()) return;
    onCreateList(newListName.trim(), place);
    setNewListName('');
  }

  return (
    <div className="favorite-menu" onClick={(e) => e.stopPropagation()}>
      <div className="favorite-menu-title">즐겨찾기 목록에 저장</div>
      <ul className="favorite-menu-list">
        {lists.map((list) => {
          const checked = list.places.some((p) => p.id === place.id);
          return (
            <li key={list.id}>
              <label className="favorite-menu-item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onTogglePlaceInList(list.id, place)}
                />
                <span className="favorite-menu-item-name">{list.name}</span>
                <span className="favorite-menu-item-count">{list.places.length}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <form className="favorite-menu-create" onSubmit={handleCreateAndAdd}>
        <input
          type="text"
          placeholder="+ 새 목록 만들기"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
        />
        <button type="submit">추가</button>
      </form>
    </div>
  );
}

export default function PlaceList({
  places,
  selectedIds,
  onToggle,
  expandedId,
  onToggleExpand,
  lists,
  favoriteIds,
  onTogglePlaceInList,
  onCreateList,
  emptyMessage = '검색 결과가 없습니다.',
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  if (places.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <ul className="place-list">
      {places.map((place) => {
        const isSelected = selectedIds.has(place.id);
        const isExpanded = expandedId === place.id;
        const isFavorite = favoriteIds?.has(place.id) ?? false;
        const isMenuOpen = openMenuId === place.id;
        return (
          <li key={place.id} className="place-item-wrap">
            <div
              className={`place-item${isSelected ? ' selected' : ''}`}
              onClick={() => onToggleExpand(place)}
            >
              <div className="place-info">
                <div className="place-name">{place.name}</div>
                <div className="place-address">{place.address}</div>
                <div className="place-category">{place.category}</div>
                {place.note && <div className="place-note">{place.note}</div>}
              </div>
              <div className="place-actions">
                {lists && (
                  <div className="favorite-menu-wrap">
                    <button
                      type="button"
                      className={`favorite-btn${isFavorite ? ' active' : ''}`}
                      title="즐겨찾기 목록에 저장"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(isMenuOpen ? null : place.id);
                      }}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>
                    {isMenuOpen && (
                      <>
                        <div
                          className="favorite-menu-backdrop"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                          }}
                        />
                        <FavoriteMenu
                          place={place}
                          lists={lists}
                          onTogglePlaceInList={onTogglePlaceInList}
                          onCreateList={onCreateList}
                        />
                      </>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className={`select-btn${isSelected ? ' selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(place);
                  }}
                >
                  {isSelected ? '선택됨' : '선택'}
                </button>
              </div>
            </div>
            <div className={`place-detail-wrap${isExpanded ? ' expanded' : ''}`}>
              <div className="place-detail-inner">
                <PlaceDetailContent place={place} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
