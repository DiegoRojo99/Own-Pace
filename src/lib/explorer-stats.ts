export type VisitedTile = { x: number; y: number; firstVisitedAt: Date };
const key = (x: number, y: number) => `${x}/${y}`;

/** Count distinct claimed tiles. */
export function totalTiles(tiles: Set<string>): number { return tiles.size; }

/** Find the side length of the largest fully claimed square in a sparse grid. */
export function largestSquare(tiles: Set<string>): number {
  const cells = [...tiles].map((tile) => tile.split("/").map(Number) as [number, number])
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
  const sizes = new Map<string, number>();
  let largest = 0;
  for (const [x, y] of cells) {
    const size = 1 + Math.min(sizes.get(key(x - 1, y)) ?? 0, sizes.get(key(x, y - 1)) ?? 0, sizes.get(key(x - 1, y - 1)) ?? 0);
    sizes.set(key(x, y), size);
    largest = Math.max(largest, size);
  }
  return largest;
}

/** Find the largest edge-connected group without recursive traversal. */
export function largestCluster(tiles: Set<string>): number {
  const remaining = new Set(tiles);
  let largest = 0;
  while (remaining.size) {
    const start = remaining.values().next().value;
    if (start === undefined) break;
    remaining.delete(start);
    const stack = [start];
    let size = 0;
    while (stack.length) {
      const [x, y] = stack.pop()!.split("/").map(Number);
      size++;
      for (const neighbor of [key(x - 1, y), key(x + 1, y), key(x, y - 1), key(x, y + 1)]) {
        if (remaining.delete(neighbor)) stack.push(neighbor);
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

/** Count first visits by UTC calendar month. */
export function tilesByMonth(tiles: VisitedTile[]): { month: string; count: number }[] {
  const months = new Map<string, number>();
  for (const tile of tiles) {
    const month = tile.firstVisitedAt.toISOString().slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}
