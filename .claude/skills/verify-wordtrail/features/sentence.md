# 文脈を取る

単語をダブルクリックすると、パネルに単語と一緒に、その単語を含む 1 文とページの URL が出る。HTML のソースの改行は空白として扱い、`e.g.` や `U.S.` のような略語では文を切らない。

## Sub-features

- `sentence-basic` は、単語を含む 1 文を出す。
- `sentence-url` は、ページの URL を出す。
- `sentence-nested` は、入れ子のインライン要素の中の語でも、ブロック全体から 1 文を切り出す。
- `sentence-abbrev` は、`U.S.` のような略語と、ソースの改行をまたいで 1 文を保つ。

## How to get to it (user POV)

- 読んでいるページで単語をダブルクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく（開き方は [単語を選ぶ](./select-word.md) の Gotchas を参照）。

- **1 文と URL。** `#idempotent` をダブルクリックする。`verify.mjs run sentence` で、`#sentence` が `単語 The API is ubiquitous and idempotent.`、`#url` が試験用ページの URL になることを確かめる。
- **入れ子と略語。** `#deprecated`（`<em>` の中の `<b>`）をダブルクリックする。`#sentence` が `The U.S. team has deprecated the old API.` になる。
- **証跡。** `sentence-page.png` と `sentence-panel.png` に、最後の状態が残る。

## Gotchas

- `Mr.` のような敬称のところでは文が切れる。v0.1 の対象外なので、合格の条件にしない。
- 文の範囲は、ダブルクリックした語を含む、インラインでない最も近い要素で決まる。試験用ページに要素を足すときは、`<p>` の中に置く。
