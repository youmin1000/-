import { formatDistance, formatDuration } from '../formatRoute.js';

const MODE_LABELS = { car: '자동차', walk: '도보', transit: '대중교통' };
const TRANSIT_MODE_LABELS = {
  WALK: '도보',
  BUS: '버스',
  SUBWAY: '지하철',
  EXPRESSBUS: '고속버스',
  TRAIN: '기차',
  AIRPLANE: '비행기',
  FERRY: '배',
};

function TransitStep({ step, transitColors }) {
  if (step.mode === 'WALK') {
    return (
      <li className="route-step route-step-walk">
        도보 {formatDuration(step.durationSeconds)} ({formatDistance(step.distanceMeters)})
      </li>
    );
  }

  const color = transitColors?.[`${step.mode}:${step.routeName || ''}`] || '#3b6ef6';

  return (
    <li className="route-step route-step-transit">
      <span className="transit-route-badge" style={{ background: color }}>
        {TRANSIT_MODE_LABELS[step.mode] || step.mode} {step.routeName || ''}
      </span>
      <span className="route-step-detail">
        {step.startName} → {step.endName}
        {step.stationCount != null && ` (${step.stationCount}개 정류장)`} ·{' '}
        {formatDuration(step.durationSeconds)}
      </span>
    </li>
  );
}

function CarWalkStep({ step }) {
  return (
    <li className="route-step">
      {step.instruction}
      {step.distanceMeters > 0 && <span className="route-step-distance"> · {formatDistance(step.distanceMeters)}</span>}
    </li>
  );
}

export default function RouteDetailPanel({
  visible,
  onClose,
  mode,
  legs,
  distanceMeters,
  durationSeconds,
  fareWon,
  loading,
  error,
  transitColors,
}) {
  if (!visible) return null;

  return (
    <div className="route-detail-panel">
      <div className="route-detail-header">
        <span>{MODE_LABELS[mode]} 상세 경로</span>
        <button type="button" className="route-detail-close" onClick={onClose}>
          닫기
        </button>
      </div>

      {loading && <div className="route-detail-status">경로 계산 중...</div>}
      {!loading && error && <div className="route-detail-status route-detail-error">{error}</div>}

      {!loading && !error && legs && (
        <>
          <div className="route-detail-summary">
            총 {formatDistance(distanceMeters)} · 약 {formatDuration(durationSeconds)}
            {fareWon != null && ` · ${fareWon.toLocaleString()}원`}
          </div>
          {legs.map((leg, i) => (
            <div className="route-detail-leg" key={i}>
              {legs.length > 1 && (
                <div className="route-detail-leg-header">
                  {i + 1}구간: {leg.fromName} → {leg.toName}
                </div>
              )}
              <ul className="route-step-list">
                {leg.steps.map((step, j) =>
                  mode === 'transit' ? (
                    <TransitStep step={step} transitColors={transitColors} key={j} />
                  ) : (
                    <CarWalkStep step={step} key={j} />
                  )
                )}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
