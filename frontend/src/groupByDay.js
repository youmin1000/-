// selectedPlaces(전역 순서 배열)를 일차(day)별로 묶는 공용 헬퍼.
// SelectedRoute.jsx / KakaoMap.jsx / App.jsx 세 곳이 전부 이 함수를 써야
// "몇 번째 일차의 몇 번째 장소인지"에 대한 계산이 서로 어긋나지 않는다.
// place.day가 없으면(이 기능 이전에 저장/공유된 동선) 1일차로 취급해 하위호환한다.
export function groupPlacesByDay(places) {
  const groups = new Map(); // day -> [{ place, globalIndex, dayIndex }]

  places.forEach((place, globalIndex) => {
    const day = place.day || 1;
    if (!groups.has(day)) groups.set(day, []);
    const items = groups.get(day);
    items.push({ place, globalIndex, dayIndex: items.length + 1 });
  });

  return Array.from(groups.entries())
    .sort(([dayA], [dayB]) => dayA - dayB)
    .map(([day, items]) => ({ day, items }));
}
