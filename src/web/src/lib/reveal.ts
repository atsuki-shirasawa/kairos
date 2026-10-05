/**
 * If `el` is entirely outside the visible part of `container`, scrolls it to a quarter from the top.
 * Leaves it alone if any part is visible (so selecting by click doesn't make the view jump).
 * `offsetTop` is the height of a sticky header; anything hidden beneath it counts as not visible.
 */
export function reveal(container: HTMLElement | null, el: Element | null, offsetTop = 0): void {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.bottom > c.top + offsetTop && r.top < c.bottom) return;
  container.scrollTop += r.top - c.top - offsetTop - (c.height - offsetTop) / 4;
}
