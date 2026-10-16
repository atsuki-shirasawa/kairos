// Telling a reconnection of the server's event stream from its first connection.

/**
 * An `open` handler that calls `onReconnect` on every open but the first. EventSource reconnects on
 * its own after the server restarts or the Mac wakes, but events sent while it was away are lost.
 */
export function reopenHandler(onReconnect: () => void): () => void {
  let opened = false;
  return () => {
    if (opened) onReconnect();
    opened = true;
  };
}
