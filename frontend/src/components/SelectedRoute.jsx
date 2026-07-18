export default function SelectedRoute({ selectedPlaces, onRemove, onMove }) {
  if (selectedPlaces.length === 0) {
    return <div className="empty-state">방문할 관광지를 선택해주세요.</div>;
  }

  return (
    <ul className="selected-list">
      {selectedPlaces.map((place, index) => (
        <li key={place.id} className="selected-item">
          <span className="order-badge">{index + 1}</span>
          <span className="selected-item-name">{place.name}</span>
          <span className="order-buttons">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
              title="위로"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={index === selectedPlaces.length - 1}
              onClick={() => onMove(index, index + 1)}
              title="아래로"
            >
              ▼
            </button>
          </span>
          <button
            type="button"
            className="remove-btn"
            onClick={() => onRemove(place.id)}
          >
            삭제
          </button>
        </li>
      ))}
    </ul>
  );
}
