/**
 * 要約の本文に出てくる `#1234` を、リポジトリの Issue / PR へのリンクにする remark プラグイン。
 * 要約は PR を番号だけで書くことが多く、成果の一覧にない PR（レビューや reopen したもの）も
 * そこから開けるようにするため。`/issues/番号` は PR なら GitHub が PR へ転送する。
 */

export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** 直前が英数字・`&`・`/` のものは除く（`&#123;` や URL の一部を拾わないため）。 */
const REF_RE = /(?<![\w&/])#(\d+)\b/g;

/** リンクにしてよいリポジトリなら、その URL。いまは GitHub だけ（他のホストは URL の形が違う）。 */
export function issueBaseUrl(repo: string | null | undefined): string | null {
  if (!repo || !/^github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://${repo}`;
}

export function remarkIssueLinks({ baseUrl }: { baseUrl: string }) {
  return (tree: MdNode) => {
    walk(tree, baseUrl);
  };
}

function walk(node: MdNode, baseUrl: string) {
  // リンクの中はすでにリンクなので触らない。コードは text ノードを持たないので自然に除かれる
  if (!node.children || node.type === "link" || node.type === "linkReference") return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || child.value === undefined) {
      walk(child, baseUrl);
      return [child];
    }
    return splitText(child.value, baseUrl);
  });
}

function splitText(text: string, baseUrl: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({
      type: "link",
      url: `${baseUrl}/issues/${m[1]}`,
      children: [{ type: "text", value: m[0] }],
    });
    last = m.index + m[0].length;
  }
  if (last === 0) return [{ type: "text", value: text }];
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
