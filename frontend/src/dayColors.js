// 방문 순서를 여러 일차로 나눴을 때, 일차별로 구분되는 지도 핀/섹션 색상.
export const DAY_COLORS = [
  '#3b82f6', // 1일차 blue
  '#f97316', // 2일차 orange
  '#10b981', // 3일차 green
  '#ec4899', // 4일차 pink
  '#a855f7', // 5일차 purple
  '#eab308', // 6일차 gold
  '#14b8a6', // 7일차 teal
  '#ef4444', // 8일차 red
];

export function colorForDay(day) {
  const idx = Math.max(1, day || 1) - 1;
  return DAY_COLORS[idx % DAY_COLORS.length];
}
