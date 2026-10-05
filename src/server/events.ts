import type { ServerEvent } from "../shared/api.ts";

type Listener = (event: ServerEvent) => void;

/** 取り込みの結果などを、SSE で接続中のブラウザへ配る。 */
export class EventHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: ServerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  get size(): number {
    return this.listeners.size;
  }
}
