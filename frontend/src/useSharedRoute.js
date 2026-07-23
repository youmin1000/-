import { useEffect, useRef, useState } from 'react';
import { getSharedRoute, updateSharedRoute, buildSharedRouteWsUrl } from './api.js';

const PUSH_DEBOUNCE_MS = 600;

// 공유 동선(백엔드 영속 + WebSocket 실시간 동기화)을 다루는 훅.
// 로컬 전용인 useSavedRoutes와는 완전히 별개의 개념이다.
export function useSharedRoute(initialShareId) {
  const [shareId, setShareId] = useState(initialShareId || null);
  const [remotePlaces, setRemotePlaces] = useState(null); // 최초 로드/원격 수정 결과 — App이 이 값을 selectedPlaces에 반영
  const [remoteName, setRemoteName] = useState('');
  const [connectedCount, setConnectedCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(initialShareId));
  const [error, setError] = useState(null);
  const [clientId] = useState(() => crypto.randomUUID());
  const wsRef = useRef(null);
  const debounceRef = useRef(null);
  // createShare()로 방금 직접 만든 공유는 이미 최신 상태를 알고 있으므로,
  // 굳이 서버에 다시 GET하지 않도록(그리고 아직 저장 전이라 404가 뜨지 않도록) 건너뛴다.
  const skipInitialFetchRef = useRef(false);

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;

    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
      getSharedRoute(shareId)
        .then((record) => {
          if (cancelled) return;
          setRemotePlaces(record.places);
          setRemoteName(record.name || '');
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(err);
          setError('공유 동선을 불러오지 못했습니다. 링크가 만료되었을 수 있습니다.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    const ws = new WebSocket(buildSharedRouteWsUrl(shareId, clientId));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'presence') {
        setConnectedCount(msg.count);
      } else if (msg.type === 'edit' && msg.clientId !== clientId) {
        // 자기 자신이 보낸 수정이 되돌아온 것은 무시 (에코 루프 방지)
        setRemotePlaces(msg.places);
        setRemoteName(msg.name || '');
      }
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
      clearTimeout(debounceRef.current);
    };
  }, [shareId, clientId]);

  function pushUpdate(places, name) {
    if (!shareId) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'edit', clientId, places, name }));
      } else {
        updateSharedRoute(shareId, { name, places, clientId }).catch((err) => {
          console.error(err);
          setError('변경사항 저장에 실패했습니다. 인터넷 연결을 확인해주세요.');
        });
      }
    }, PUSH_DEBOUNCE_MS);
  }

  // 동기적으로 shareId를 반환한다 — navigator.share()는 클릭 이벤트로부터 너무 늦게
  // (예: 네트워크 응답을 기다린 뒤) 호출하면 브라우저가 "사용자 제스처가 아님"으로 판단해
  // 네이티브 공유 시트 대신 실패 처리한다. 그래서 서버 저장은 기다리지 않고 백그라운드로 보낸다.
  function createShare(name, places) {
    const newShareId = crypto.randomUUID();
    skipInitialFetchRef.current = true;
    // 참조가 selectedPlaces와 동일하면 App.jsx의 setSelectedPlaces가 아무 변화 없다고
    // 판단해 리렌더를 건너뛰고, 그 결과 isApplyingRemoteRef 플래그가 안 풀려서 다음 로컬
    // 수정이 서버로 전송되지 않는 문제가 생긴다. 새 배열로 복사해 참조를 다르게 만든다.
    setRemotePlaces([...places]);
    setRemoteName(name || '');
    setShareId(newShareId);
    updateSharedRoute(newShareId, { name, places, clientId }).catch((err) => {
      console.error(err);
      setError('공유 동선 저장에 실패했습니다. 다시 공유해주세요.');
    });
    return newShareId;
  }

  return { shareId, remotePlaces, remoteName, connectedCount, loading, error, pushUpdate, createShare };
}
