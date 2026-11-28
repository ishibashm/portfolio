/**
 * Map ベースの小さな LRU キャッシュ。
 * JavaScript の Map は挿入順を保持するため、参照時に delete → set で
 * 末尾へ移し、上限超過時は先頭（最も古い要素）を 1 件落とす。
 */
export class Lru<K, V> {
  private readonly map = new Map<K, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined && !this.map.has(k)) return undefined;
    this.map.delete(k);
    this.map.set(k, v as V);
    return v;
  }

  set(k: K, v: V): void {
    if (this.map.has(k)) {
      this.map.delete(k);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(k, v);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
