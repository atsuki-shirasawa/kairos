import type { ServerEvent } from "../shared/api.ts";

type Listener = (event: ServerEvent) => void;

/** Broadcasts ingest results and the like to browsers connected over SSE. */
export class EventHub {
  private readonly listeners = new Set<Listener>();

  /** Registers a listener. Returns a function that unregisters it (used when SSE ends). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Delivers the event synchronously to every connected listener. */
  publish(event: ServerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Number of connected listeners. */
  get size(): number {
    return this.listeners.size;
  }
}
