// 리스트 출처(카테고리)별 지도 핀 색상.
export const CATEGORY_COLORS = {
  cafe: '#a0522d',
  indoor: '#8854d0',
  outdoor: '#27ae60',
  activity: '#e67e22',
  popup: '#d6336c',
  search: '#3b6ef6', // 직접 검색한 결과 (기본값)
};

export function colorFor(listCategory) {
  return CATEGORY_COLORS[listCategory] || CATEGORY_COLORS.search;
}
