// Bash の gh pr create 呼び出しから、作った PR の題名を取り出す。
// pr-link レコードにも結果の gitOperation にも題名はないので、コマンドの引数から読む。

export const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;

/** シェルの語。`dynamic` は `$…` や `` `…` `` を含み、値が実行時に決まるもの。 */
interface Word {
  text: string;
  dynamic: boolean;
}

/**
 * `--title "…"` / `--title=…` / `-t '…'` の値。見つからない、または `$(…)` などで
 * 実行時に決まる値なら null。`gh pr create` の後ろ、次の `&&`・`;`・`|`・改行までだけを見る。
 */
export function prTitleOf(command: string): string | null {
  const m = GH_PR_CREATE_RE.exec(command);
  if (!m) return null;
  const words = shellWords(command.slice(m.index + m[0].length));
  for (const [i, w] of words.entries()) {
    let value: Word | undefined;
    if (w.text === "--title" || w.text === "-t") value = words[i + 1];
    else if (w.text.startsWith("--title=")) value = { ...w, text: w.text.slice(8) };
    else continue;
    if (!value || value.dynamic) return null;
    return value.text.trim() || null;
  }
  return null;
}

/**
 * 1 つのコマンドの引数を、シェルと同じ規則（引用符・バックスラッシュ）で語に分ける。
 * 制御演算子（`&&`・`||`・`;`・`|`・改行）に当たったら、そこで終える。
 */
function shellWords(input: string): Word[] {
  const words: Word[] = [];
  let text = "";
  let dynamic = false;
  let inWord = false;
  const end = () => {
    if (inWord) words.push({ text, dynamic });
    text = "";
    dynamic = false;
    inWord = false;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i] ?? "";
    if (c === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) return words; // 閉じていない引用符は読めないので、そこまでにする
      text += input.slice(i + 1, close);
      inWord = true;
      i = close;
    } else if (c === '"') {
      inWord = true;
      for (i++; i < input.length && input[i] !== '"'; i++) {
        const d = input[i] ?? "";
        if (d === "\\" && i + 1 < input.length && '"\\$`\n'.includes(input[i + 1] ?? "")) {
          text += input[++i];
        } else {
          if (d === "$" || d === "`") dynamic = true;
          text += d;
        }
      }
      if (i >= input.length) return words;
    } else if (c === "\\") {
      // 行末のバックスラッシュは行の継続
      if (input[i + 1] !== "\n") text += input[i + 1] ?? "";
      inWord = inWord || input[i + 1] !== "\n";
      i++;
    } else if (c === " " || c === "\t") {
      end();
    } else if (c === "\n" || c === ";" || c === "|" || c === "&") {
      break;
    } else {
      if (c === "$" || c === "`") dynamic = true;
      text += c;
      inWord = true;
    }
  }
  end();
  return words;
}

/** 出力に含まれる PR の URL（`gitOperation` がない古いログ向け）。 */
export function prUrlIn(output: string): string | null {
  return /https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/\d+/.exec(output)?.[0] ?? null;
}
