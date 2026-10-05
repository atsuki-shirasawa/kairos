/**
 * `el` が `container` の見えている範囲から完全に外れていれば、上から 1/4 の位置まで動かす。
 * 少しでも見えていれば動かさない（クリックで選んだときに画面が跳ねないように）。
 * `offsetTop` は上に固定した見出しの高さ。その下に隠れている分は見えていないものとして扱う。
 */
export function reveal(container: HTMLElement | null, el: Element | null, offsetTop = 0): void {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.bottom > c.top + offsetTop && r.top < c.bottom) return;
  container.scrollTop += r.top - c.top - offsetTop - (c.height - offsetTop) / 4;
}
