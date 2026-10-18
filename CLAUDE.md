# Wordtrail

英語のページを読みながら単語帳を育てる、自分専用の Chrome 拡張。

## 読む場所

- 何を作るか、なぜそうしたか: `docs/adr/0001-vocabulary-notebook-while-reading.md`（v0.1 の完成条件と対象外もここ）
- 使い方（完成形として先に書いたもの）: `README.md`
- v0.1 のタスクと完了の確認: `TODO.md`
- 次の一手: `NEXT.md`
- アイデアの置き場: `docs/ideas.md`

## 構成

- `extension/` が拡張の本体で、Chrome にはこのフォルダを読み込む。ルートを読み込まないのは、`node_modules` にある `_` 始まりの名前を Chrome が拒否するため
- 素の JavaScript と HTML で書き、ビルドはしない
- `test/` に `node --test` のテストを置く。Chrome の API に依存しない純粋な処理をテストし、Chrome 上の動きは拡張を読み込んで確かめる

## コマンド

- テスト: `npm test`
- lint とフォーマットの確認: `npm run lint`（自動修正は `npx biome check --write .`）
- Chrome での検証: `.claude/skills/verify-wordtrail/verify.mjs run all`。拡張の挙動を変えたら、タスクを完了にする前に実行する。手順と機能マップは `.claude/skills/verify-wordtrail/` にある。画面ありの Chrome が要るので CI では実行しない

## 進め方

- v0.1 の対象外に入っている機能は作らない。思いついたら `docs/ideas.md` に書く
- 作業の終わりにコミットし、`NEXT.md` に次の一手を 1 行で書く
