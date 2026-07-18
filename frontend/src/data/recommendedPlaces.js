// 지역별 추천 관광지 큐레이션 목록.
// 좌표/주소는 하드코딩하지 않고, name(+area)을 카카오 키워드 검색에 사용해
// 백엔드(/api/places/search)에서 실시간으로 조회한다.
// note는 카카오 검색으로는 알 수 없는 추가 설명(예: "블루리본 선정", "83타워 전망대")이다.
//
// 아래 bulk/*.generated.js 파일들은 대량으로 받은 주소 목록을 스크립트로
// 미리 좌표/카테고리/전화번호까지 확정해 저장한 것이라, name/note만 있는
// 나머지 항목과 달리 실시간 검색 없이 바로 사용된다 (RecommendedPlaces.jsx의
// resolvePlace가 lat/lng/id 존재 여부로 자동 구분).
import { SEOUL_BULK_ACTIVITY_DISTRICTS } from './bulk/seoulActivity.generated.js';
import { DAEGU_BULK_ACTIVITY_ITEMS } from './bulk/daeguActivity.generated.js';
import { OTHER_REGIONS_ACTIVITY_BULK } from './bulk/otherRegionsActivity.generated.js';
import { SEOUL_BULK_POPUP2_DISTRICTS } from './bulk/seoulPopup2.generated.js';
import { DAEGU_BULK_POPUP2_ITEMS } from './bulk/daeguPopup2.generated.js';
import { OTHER_REGIONS_POPUP2_BULK } from './bulk/otherRegionsPopup2.generated.js';

// cafe/indoor/outdoor는 카카오 카테고리 실시간 검색(/api/places/nearby)으로 대체되어
// 더 이상 큐레이션 데이터를 쓰지 않는다 (RecommendedPlaces.jsx의 LIVE_CATEGORIES 참고).
// activity/popup은 카카오에 대응 카테고리가 없어 큐레이션을 그대로 유지한다.
export const CATEGORY_KEYS = ['cafe', 'indoor', 'outdoor', 'activity', 'popup'];

function emptyCategories() {
  return { activity: [], popup: [] };
}

// 서울은 데이터가 구별로 나뉠 만큼 많아서 "구" 2단계 선택을 지원한다.
// 다른 지역(대구 등)은 데이터가 그 정도로 많지 않아 지역 하나로 충분하므로 평면 구조를 유지한다.
// 아래 구들은 전부 빈 placeholder이며, 실제 장소 목록은 이후 구별로 채워 넣는다.
const SEOUL_DISTRICTS = [
  '종로구', '중구', '용산구', '성동구', '광진구',
  '동대문구', '중랑구', '성북구', '강북구', '도봉구',
  '노원구', '은평구', '서대문구', '마포구', '양천구',
  '강서구', '구로구', '금천구', '영등포구', '동작구',
  '관악구', '서초구', '강남구', '송파구', '강동구',
];

export const RECOMMENDED_PLACES = {
  대구: {
    activity: [
      {
        area: '방탈출 카페',
        items: [
          { name: '룸즈에이 대구동성로점', note: '추리/공포/판타지 등 다양한 테마' },
          { name: '황금열쇠 동성로점', note: '대구 2개 매장 보유 체인점' },
        ],
      },
      {
        area: '보드게임카페',
        items: [
          { name: '더홀릭보드게임카페 동성로점' },
          { name: '큐브탑보드게임카페' },
          { name: '보드게임카페 레드버튼 동성로점' },
        ],
      },
      {
        area: 'VR / 서바이벌',
        items: [
          { name: '캠프브이알', note: '동성로 · 가상현실 서바이벌, 레이싱 등' },
          { name: '레이저아레나 동성로점', note: '레이저 태그' },
        ],
      },
      {
        area: '스크린 스포츠',
        items: [
          { name: '스트라이크존 대구동성로구장', note: '스크린야구' },
          { name: '링고프룻', note: '대공원역 지하1층 · 실내야구연습장' },
        ],
      },
      { area: '대량 등록', items: DAEGU_BULK_ACTIVITY_ITEMS },
    ],

    // 기간 한정 팝업/전시. endDate가 지나면 화면에서 자동으로 빠진다 (isItemActive 참고).
    // name은 카카오 검색용 실제 장소명(팝업 자체는 별도 POI가 아니라 입점 건물 기준으로 검색),
    // displayName은 목록에 보여줄 팝업/전시 이름이다.
    popup: [
      {
        area: '팝업스토어',
        items: [
          {
            name: '더현대 대구',
            displayName: '패트와 매트 팝업스토어 (더현대 대구 9층)',
            note:
              '체코 캐릭터 테마 · 포토존 다수 · 굿즈(텀블러·스티커·에코백·키링) · 평일 10:30-20:00, 주말 10:30-20:30',
            endDate: '2026-07-24',
          },
          {
            name: '더현대 대구',
            displayName: '프론투라인 팝업스토어 (더현대 대구 3층)',
            note: '장기 운영 · 2027.1.1까지',
            endDate: '2027-01-01',
          },
        ],
      },
      {
        area: '전시',
        items: [
          {
            name: '대구문화예술회관 스페이스하이브',
            displayName: '앤디 워홀: 예술을 팔다',
            note:
              '2026.7.3~10.25 · 스페이스 하이브 1~5전시실 · 장기 기획전, 예매 필요',
            endDate: '2026-10-25',
          },
        ],
      },
      { area: '박물관 / 미술관', items: DAEGU_BULK_POPUP2_ITEMS },
    ],
  },

  서울: {
    // __districts가 있으면 "구 선택" 2단계 UI가 활성화된다 (RecommendedPlaces.jsx 참고).
    __districts: SEOUL_DISTRICTS,
    districts: Object.fromEntries(
      SEOUL_DISTRICTS.map((gu) => [
        gu,
        {
          ...emptyCategories(),
          activity: SEOUL_BULK_ACTIVITY_DISTRICTS[gu] || [],
          popup: SEOUL_BULK_POPUP2_DISTRICTS[gu] || [],
        },
      ])
    ),
  },

  ...(() => {
    const regionNames = new Set([
      ...Object.keys(OTHER_REGIONS_ACTIVITY_BULK),
      ...Object.keys(OTHER_REGIONS_POPUP2_BULK),
    ]);
    return Object.fromEntries(
      Array.from(regionNames).map((region) => [
        region,
        {
          ...emptyCategories(),
          activity: OTHER_REGIONS_ACTIVITY_BULK[region] || [],
          popup: OTHER_REGIONS_POPUP2_BULK[region] || [],
        },
      ])
    );
  })(),
};

export const REGIONS = Object.keys(RECOMMENDED_PLACES);

export function isDistrictedRegion(regionData) {
  return Array.isArray(regionData.__districts);
}

export const CATEGORY_LABELS = {
  cafe: '카페&음식점',
  indoor: '실내',
  outdoor: '실외',
  activity: '액티비티',
  popup: '팝업·전시',
};

// endDate가 지정되어 있고 이미 지났으면 비활성(만료)으로 취급한다.
export function isItemActive(item) {
  if (!item.endDate) return true;
  const end = new Date(`${item.endDate}T23:59:59`);
  return end.getTime() >= Date.now();
}
