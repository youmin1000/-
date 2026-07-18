import { useState } from 'react';

export default function ShareRoutePanel({ visible, onClose, shareUrl, connectedCount, loading, error }) {
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="route-detail-panel share-route-panel">
      <div className="route-detail-header">
        <span>동선 공유</span>
        <button type="button" className="route-detail-close" onClick={onClose}>
          닫기
        </button>
      </div>

      {loading && <div className="route-detail-status">공유 동선을 준비하는 중...</div>}
      {error && <div className="route-detail-status">{error}</div>}

      {!loading && !error && shareUrl && (
        <>
          <div className="share-route-link-row">
            <input type="text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button type="button" className="share-route-copy-btn" onClick={handleCopy}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <div className="share-route-presence">
            <span className="share-route-presence-dot" />
            {connectedCount}명 접속 중 · 실시간 동기화 중
          </div>
        </>
      )}
    </div>
  );
}
