import { useEffect, useRef, useState } from 'react';
import { getPlaceDetail, photoUrl } from '../api.js';
import { colorForDay } from '../dayColors.js';

// 구글 weekdayDescriptions는 월요일부터 시작하는 배열이라, JS의 getDay()(0=일요일)를
// 그 인덱스로 맞추려면 6일 밀어줘야 한다.
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function GoogleDetailSection({ loading, error, detail }) {
  const [showReviews, setShowReviews] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [lightboxName, setLightboxName] = useState(null);

  if (loading) {
    return <div className="google-detail-status">추가 정보를 불러오는 중...</div>;
  }
  // 구글에 없는 업장일 수 있어(특히 소규모 로컬 매장), 실패해도 조용히 숨기고
  // 기존 카카오 정보만 보여준다 — 별도 에러 배너로 화면을 어지럽히지 않는다.
  if (error || !detail || !detail.found) return null;

  return (
    <div className="google-detail">
      {detail.photoNames.length > 0 && (
        <div className="google-detail-photos">
          {detail.photoNames.map((name) => (
            <img
              key={name}
              src={photoUrl(name, 300)}
              alt=""
              onClick={() => setLightboxName(name)}
            />
          ))}
        </div>
      )}
      {(detail.rating != null || detail.openNow != null) && (
        <div className="google-detail-meta">
          {detail.rating != null && (
            <button
              type="button"
              className="google-detail-rating"
              onClick={() => setShowReviews((v) => !v)}
              disabled={detail.reviews.length === 0}
            >
              ★ {detail.rating.toFixed(1)} ({detail.userRatingCount ?? 0})
              {detail.reviews.length > 0 && (showReviews ? ' ▲' : ' ▼')}
            </button>
          )}
          {detail.openNow != null && (
            <span className={`google-detail-open${detail.openNow ? '' : ' closed'}`}>
              {detail.openNow ? '영업 중' : '영업 종료'}
            </span>
          )}
        </div>
      )}
      {detail.weekdayDescriptions.length > 0 && (
        <div className="google-detail-hours">
          <button
            type="button"
            className="google-detail-hours-toggle"
            onClick={() => setShowHours((v) => !v)}
          >
            <span>영업시간</span>
            <span className="google-detail-hours-today">
              {detail.weekdayDescriptions[todayIndex()]}
            </span>
            <span className="google-detail-hours-chevron">{showHours ? '▲' : '▼'}</span>
          </button>
          {showHours && (
            <ul className="google-detail-hours-list">
              {detail.weekdayDescriptions.map((d, i) => {
                const separatorIndex = d.indexOf(': ');
                const day = separatorIndex === -1 ? d : d.slice(0, separatorIndex);
                const time = separatorIndex === -1 ? '' : d.slice(separatorIndex + 2);
                return (
                  <li key={d} className={i === todayIndex() ? 'is-today' : ''}>
                    <span className="google-detail-hours-day">{day}</span>
                    <span className="google-detail-hours-time">{time}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {showReviews && detail.reviews.length > 0 && (
        <div className="google-detail-reviews">
          {detail.reviews.map((r, i) => (
            <div className="google-detail-review" key={i}>
              <div className="google-detail-review-head">
                <span className="google-detail-review-author">{r.author}</span>
                <span className="google-detail-review-rating">★ {r.rating}</span>
                <span className="google-detail-review-time">{r.relativeTime}</span>
              </div>
              <div className="google-detail-review-text">{r.text}</div>
            </div>
          ))}
        </div>
      )}
      {lightboxName && (
        <div className="photo-lightbox-backdrop" onClick={() => setLightboxName(null)}>
          <button type="button" className="photo-lightbox-close" onClick={() => setLightboxName(null)}>
            ✕
          </button>
          <img
            className="photo-lightbox-img"
            src={photoUrl(lightboxName, 1200)}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function PlaceDetailContent({ place, isExpanded }) {
  const showLotAddressSeparately = place.lotAddress && place.lotAddress !== place.roadAddress;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const fetchedRef = useRef(false);

  // 실제로 펼쳤을 때만, 그리고 장소당 한 번만 구글 상세정보를 가져온다
  // (모든 목록 항목에 대해 한꺼번에 호출하면 API 사용량이 불필요하게 늘어난다).
  useEffect(() => {
    if (!isExpanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setDetailLoading(true);
    getPlaceDetail(place)
      .then((data) => setDetail(data))
      .catch((err) => {
        console.error(err);
        setDetailError(true);
      })
      .finally(() => setDetailLoading(false));
  }, [isExpanded, place]);

  return (
    <div className="place-detail-content">
      <GoogleDetailSection loading={detailLoading} error={detailError} detail={detail} />
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
  dayById,
  activeDay = 1,
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
        const existingDay = dayById?.get(place.id);
        // 이미 선택되어 있지만 "다른" 날짜에 들어있는 경우 — 다시 누르면 삭제가 아니라
        // 지금 활성화된 날짜로 이동한다는 걸 미리 알려준다.
        const isInOtherDay = isSelected && existingDay != null && existingDay !== activeDay;
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
                  className={`select-btn${isSelected ? ' selected' : ''}${isInOtherDay ? ' other-day' : ''}`}
                  style={
                    isInOtherDay
                      ? { borderColor: colorForDay(existingDay), color: colorForDay(existingDay) }
                      : undefined
                  }
                  title={isInOtherDay ? `${existingDay}일차에 있음 — 누르면 ${activeDay}일차로 이동` : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(place);
                  }}
                >
                  {isInOtherDay ? `${existingDay}일차 · 이동` : isSelected ? '선택됨' : '선택'}
                </button>
              </div>
            </div>
            <div className={`place-detail-wrap${isExpanded ? ' expanded' : ''}`}>
              <div className="place-detail-inner">
                <PlaceDetailContent place={place} isExpanded={isExpanded} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
