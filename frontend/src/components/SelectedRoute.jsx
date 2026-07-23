import { groupPlacesByDay } from '../groupByDay.js';
import { colorForDay } from '../dayColors.js';

export default function SelectedRoute({
  selectedPlaces,
  onRemove,
  onMove,
  activeDay,
  dayCount,
  onSelectDay,
  onAddDay,
}) {
  const dayTabs = Array.from({ length: dayCount }, (_, i) => i + 1);

  return (
    <>
      {selectedPlaces.length > 0 && (
        <div className="day-tab-row">
          {dayTabs.map((day) => {
            const isActive = day === activeDay;
            const color = colorForDay(day);
            return (
              <button
                key={day}
                type="button"
                className={`day-tab-btn${isActive ? ' active' : ''}`}
                style={
                  isActive
                    ? { background: color, borderColor: color }
                    : { borderColor: color, color }
                }
                onClick={() => onSelectDay(day)}
              >
                {day}일차
              </button>
            );
          })}
          <button type="button" className="day-tab-add-btn" onClick={onAddDay}>
            + 다음날
          </button>
        </div>
      )}

      {selectedPlaces.length === 0 ? (
        <div className="empty-state">방문할 관광지를 선택해주세요.</div>
      ) : (
        groupPlacesByDay(selectedPlaces).map(({ day, items }) => (
          <div key={day} className="day-group">
            <div className="day-group-header" style={{ color: colorForDay(day) }}>
              {day}일차
            </div>
            <ul className="selected-list">
              {items.map(({ place, globalIndex, dayIndex }, localIndex) => (
                <li key={place.id} className="selected-item">
                  <span className="order-badge" style={{ background: colorForDay(day) }}>
                    {dayIndex}
                  </span>
                  <span className="selected-item-name">{place.name}</span>
                  <span className="order-buttons">
                    <button
                      type="button"
                      disabled={localIndex === 0}
                      onClick={() => onMove(globalIndex, items[localIndex - 1].globalIndex)}
                      title="위로"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={localIndex === items.length - 1}
                      onClick={() => onMove(globalIndex, items[localIndex + 1].globalIndex)}
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
          </div>
        ))
      )}
    </>
  );
}
