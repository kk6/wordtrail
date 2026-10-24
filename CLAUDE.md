# Wordtrail

英語のページを読みながら単語帳を育てる、自分専用の Chrome 拡張。

## 読む場所

- 何を作るか、なぜそうしたか: `docs/adr/`。全体の方針は ADR-0001 に書いた。範囲を足したり変えたりしたときは、その後の ADR に書いた。対象外の機能は、各 ADR の Non-goals に書いた
- 使い方: `README.md`
- 版ごとのタスクと完了の確認: `TODO.md`
- 次の一手: `NEXT.md`
- アイデアの置き場: `docs/ideas.md`
- 版ごとの変更: `CHANGELOG.md`

## 構成

- `extension/` が拡張の本体で、Chrome にはこのフォルダを読み込む。ルートを読み込まないのは、`node_modules` にある `_` 始まりの名前を Chrome が拒否するため
- 素の JavaScript と HTML で書き、ビルドはしない
- `test/` に `node --test` のテストを置く。Chrome の API に依存しない純粋な処理をテストし、Chrome 上の動きは拡張を読み込んで確かめる

## コマンド

- テスト: `npm test`
- lint とフォーマットの確認: `npm run lint`（自動修正は `npx biome check --write .`）
- Chrome での検証: `.claude/skills/verify-wordtrail/verify.mjs run all`。拡張の挙動を変えたら、タスクを完了にする前に実行する。手順と機能マップは `.claude/skills/verify-wordtrail/` にある。画面ありの Chrome が要るので CI では実行しない

## 進め方

- ADR の Non-goals に入っている機能や、どの ADR にもない機能は作らない。思いついたら `docs/ideas.md` に書く
- 使う人から見える挙動を変えたら、`README.md` の該当する手順も直す
- 作業の終わりにコミットし、`NEXT.md` に次の一手を 1 行で書く
- 使う人から見える変更は、`CHANGELOG.md` の「未リリース」に書く。版にするときは、`manifest.json` の `version` を上げ、`v0.x.0` のタグを付ける
