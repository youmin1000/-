// 지도용 Maps SDK(loadKakaoMaps.js)와는 별개의, 카카오톡 공유용 일반 Kakao JS SDK 로더.
// 같은 JavaScript 키를 쓰지만, 콘솔에서 "카카오톡 공유" 제품이 별도로 켜져 있어야 동작한다.
const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';

let loadPromise = null;

export function loadKakaoShare() {
  if (window.Kakao && window.Kakao.isInitialized()) {
    return Promise.resolve(window.Kakao);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      try {
        if (!window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_JS_KEY);
        }
        resolve(window.Kakao);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('카카오 공유 SDK 로드에 실패했습니다.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
