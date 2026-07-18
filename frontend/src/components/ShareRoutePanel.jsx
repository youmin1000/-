import { useEffect, useState } from 'react';
import { loadKakaoShare } from '../loadKakaoShare.js';

function KakaoTalkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path
        d="M12 4C6.5 4 2 7.4 2 11.6c0 2.7 1.8 5.1 4.6 6.5-.2.7-.8 2.6-.9 3 0 .1 0 .3.1.4.1.1.3.1.4 0 .4-.3 3.1-2.1 3.6-2.4.7.1 1.4.2 2.2.2 5.5 0 10-3.4 10-7.7S17.5 4 12 4Z"
        fill="#391B1B"
      />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path
        d="M12 3C6.5 3 2 6.7 2 11.2c0 2.5 1.4 4.8 3.6 6.3L4.4 21l4.3-1.8c1 .3 2.1.4 3.3.4 5.5 0 10-3.7 10-8.4S17.5 3 12 3Z"
        fill="#fff"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.3" stroke="#fff" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="#fff" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path
        d="M14.5 8.5h2V5.7c-.35-.05-1.5-.15-2.85-.15-2.8 0-4.7 1.7-4.7 4.9v2.4H6v3.3h2.95V22h3.4v-5.85h2.85l.45-3.3h-3.3v-2.1c0-.95.25-1.6 1.65-1.6Z"
        fill="#fff"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M4.5 4l15 16M19.5 4l-15 16" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path
        d="M9 8.5c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.4.2.5.7 1.6.7 1.8s0 .3-.1.5c-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.4 1 1.6 2.1 2.2 1.4.8 1.4.5 1.6.5.2 0 .5-.3.7-.5.2-.2.4-.3.7-.2.2.1 1.5.7 1.8.8.3.2.5.2.5.4 0 .2 0 1-.4 1.4-.4.4-1.4.9-2.5.5-1-.4-2.4-1-4-2.6-1.3-1.3-2-2.5-2.4-3.3-.4-.7-.1-1.1.1-1.3.2-.3.5-.6.6-.8Z"
        fill="#fff"
      />
    </svg>
  );
}

// navigator.share()(OS 네이티브 공유 시트)는 카카오톡 같은 인앱브라우저에서 열었을 때
// 지원되지 않는 경우가 많아, 어디서 열어도 항상 똑같이 동작하는 자체 공유 버튼들을 둔다.
const SHARE_TARGETS = [
  { key: 'kakao', label: '카카오톡', bg: '#FEE500', Icon: KakaoTalkIcon },
  { key: 'sms', label: '문자', bg: '#3b82f6', Icon: MessagesIcon },
  { key: 'instagram', label: '인스타그램', bg: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)', Icon: InstagramIcon },
  { key: 'facebook', label: 'Facebook', bg: '#1877F2', Icon: FacebookIcon },
  { key: 'x', label: 'X', bg: '#111', Icon: XIcon },
  { key: 'whatsapp', label: 'WhatsApp', bg: '#25D366', Icon: WhatsAppIcon },
];

function openShareTarget(key, { shareUrl, routeName, onCopyToast }) {
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

  // 인스타그램은 외부 링크를 직접 받아 공유하는 웹 방식을 지원하지 않아, 링크를 복사해서
  // 앱에 직접 붙여넣도록 안내하는 것 외에는 방법이 없다.
  if (key === 'instagram') {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => onCopyToast('링크가 복사됐어요. 인스타그램에 붙여넣기 해주세요'))
      .catch(console.error);
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
  const [toast, setToast] = useState(null);

  // 패널이 뜨는 시점에 미리 로드해둬야, 실제 버튼을 눌렀을 때 지연 없이 바로 앱 연동이 된다.
  useEffect(() => {
    if (visible) loadKakaoShare().catch(console.error);
  }, [visible]);

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
            {SHARE_TARGETS.map(({ key, label, bg, Icon }) => (
              <button
                key={key}
                type="button"
                className="share-route-target-btn"
                onClick={() => openShareTarget(key, { shareUrl, routeName, onCopyToast: showToast })}
              >
                <span className="share-route-target-icon" style={{ background: bg }}>
                  <Icon />
                </span>
                <span className="share-route-target-label">{label}</span>
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
