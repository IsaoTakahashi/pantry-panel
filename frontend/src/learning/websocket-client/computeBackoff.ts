export function computeBackoff(attempt: number): number {
  const table = [500, 1000, 2000, 5000, 10000];
  return table[Math.min(attempt, table.length - 1)];
}
