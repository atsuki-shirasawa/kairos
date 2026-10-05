/** Kairos がローカルで待ち受けるポート。SessionStart hook からの起動確認にも使う。 */
export const PORT = 4319;
export const HOST = "127.0.0.1";
/** Host ヘッダとして受け付ける名前。DNS rebinding 対策で、これ以外は拒否する。 */
export const ALLOWED_HOSTS = ["127.0.0.1", "localhost"] as const;
/** PR のリンクは作成の少し後に記録されることがあるので、作業ブロックの成果は終わりからこの時間まで含める。 */
export const ARTIFACT_GRACE_MS = 5 * 60_000;
