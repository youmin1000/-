import { useEffect, useRef, useState } from 'react';
import { createSharedRoute, getSharedRoute, updateSharedRoute, buildSharedRouteWsUrl } from './api.js';

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

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
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
        updateSharedRoute(shareId, { name, places, clientId }).catch(console.error);
      }
    }, PUSH_DEBOUNCE_MS);
  }

  async function createShare(name, places) {
    const record = await createSharedRoute(name, places);
    setRemotePlaces(record.places);
    setRemoteName(record.name || '');
    setShareId(record.shareId);
    return record.shareId;
  }

  return { shareId, remotePlaces, remoteName, connectedCount, loading, error, pushUpdate, createShare };
}
