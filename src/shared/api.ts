// サーバーとフロントで共有する API の型。

export interface HealthResponse {
  ok: true;
  name: "kairos";
  version: string;
}
