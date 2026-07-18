import { useState } from 'react';

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.3" stroke="#fff" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="#fff" />
    </svg>
  );
}

// 이 패널은 navigator.share()(디바이스 네이티브 공유 시트)를 못 쓰는 환경(주로 데스크톱)에서만
// 뜨는 대체 수단이다 — 모바일/앱에서는 공유 아이콘을 누를 때마다 항상 디바이스 공유 시트가 먼저 뜬다.
// 인스타그램은 외부 링크를 직접 받는 공유 방식을 지원하지 않아 네이티브 시트에도 안 나오므로,
// 여기에서만 별도로 "링크 복사 후 붙여넣기" 안내를 해준다.
export default function ShareRoutePanel({ visible, onClose, shareUrl, connectedCount, loading, error }) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);

  if (!visible) return null;

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  function handleInstagram() {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => showToast('링크가 복사됐어요. 인스타그램에 붙여넣기 해주세요'))
      .catch(console.error);
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
          {toast && <div className="share-route-toast">{toast}</div>}

          <div className="share-route-targets">
            <button type="button" className="share-route-target-btn" onClick={handleInstagram}>
              <span
                className="share-route-target-icon"
                style={{ background: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)' }}
              >
                <InstagramIcon />
              </span>
              <span className="share-route-target-label">인스타그램</span>
            </button>
          </div>

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
