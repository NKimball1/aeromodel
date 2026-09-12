/** Minimal state container: one source of truth, synchronous subscribers. */
export class Store<T> {
  private listeners = new Set<(state: T) => void>();

  constructor(private state: T) {}

  get(): T {
    return this.state;
  }

  update(fn: (state: T) => T): void {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l(next);
  }

  subscribe(listener: (state: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
