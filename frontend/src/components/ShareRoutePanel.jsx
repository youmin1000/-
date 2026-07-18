import { useEffect, useState } from 'react';
import { loadKakaoShare } from '../loadKakaoShare.js';

// navigator.share()(OS 네이티브 공유 시트)는 카카오톡 같은 인앱브라우저에서 열었을 때
// 지원되지 않는 경우가 많아, 어디서 열어도 항상 똑같이 동작하는 자체 공유 버튼들을 둔다.
const SHARE_TARGETS = [
  { key: 'kakao', label: '카카오톡', bg: '#FEE500', color: '#391B1B' },
  { key: 'sms', label: '문자', bg: '#4cd964', color: '#fff' },
  { key: 'whatsapp', label: 'WhatsApp', bg: '#25D366', color: '#fff' },
  { key: 'facebook', label: 'Facebook', bg: '#1877F2', color: '#fff' },
  { key: 'x', label: 'X', bg: '#111', color: '#fff' },
];

function openShareTarget(key, { shareUrl, routeName }) {
  const title = routeName || '내 여행 동선';
  const text = '같이 보고 수정할 수 있는 여행 동선을 공유합니다';

  if (key === 'kakao') {
    // Kakao.Share.sendDefault는 "방금 사용자가 눌렀다"는 상태에서 바로 호출돼야
    // 카카오톡 앱으로 연동된다 — 미리 로드해둔 SDK를 여기서 동기적으로 바로 쓴다.
    // (클릭 시점에 비동기로 SDK를 불러오면 그 사이 활성화 상태가 풀려 웹으로 빠진다.)
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      alert('카카오톡 공유 준비 중입니다. 잠시 후 다시 시도해주세요.');
      loadKakaoShare().catch(console.error);
      return;
    }
    window.Kakao.Share.sendDefault({
      objectType: 'text',
      text: `${title}\n${text}`,
      link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
    });
    return;
  }

  const urls = {
    sms: `sms:?body=${encodeURIComponent(`${text} ${shareUrl}`)}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${shareUrl}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
  };
  window.open(urls[key], '_blank', 'noopener,noreferrer');
}

export default function ShareRoutePanel({ visible, onClose, shareUrl, routeName, connectedCount, loading, error }) {
  const [copied, setCopied] = useState(false);

  // 패널이 뜨는 시점에 미리 로드해둬야, 실제 버튼을 눌렀을 때 지연 없이 바로 앱 연동이 된다.
  useEffect(() => {
    if (visible) loadKakaoShare().catch(console.error);
  }, [visible]);

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
          <div className="share-route-targets">
            {SHARE_TARGETS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="share-route-target-btn"
                onClick={() => openShareTarget(t.key, { shareUrl, routeName })}
              >
                <span className="share-route-target-icon" style={{ background: t.bg, color: t.color }}>
                  {t.label[0]}
                </span>
                <span className="share-route-target-label">{t.label}</span>
              </button>
            ))}
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
