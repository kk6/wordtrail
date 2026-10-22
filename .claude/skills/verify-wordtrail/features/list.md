# 一覧と削除

パネル上部の **一覧** で、登録した単語が新しい順に並ぶ。単語をクリックすると、その場で Wiktionary の意味、メモ、これまでの文脈が開く。Wiktionary とメモは別々のラベルで出て、メモが空の単語にはメモの欄を出さない。**削除** を押すと確認のダイアログが出て、承認したときだけ単語帳から消える。一覧を見ている間に単語をダブルクリックすると、編集の画面に戻る。

## Sub-features

- `list-order` は、登録した日時の新しい順に並べる。
- `list-detail` は、単語をクリックすると Wiktionary の意味、メモ（空でなければ）、これまでの文脈を開く。
- `list-delete` は、確認のダイアログで承認したときだけ単語を消す。

## How to get to it (user POV)

- パネル上部の **一覧** をクリックする。編集の画面に戻るときは **戻る** をクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（登録で意味が入るのを待つため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **登録。** `#ubiquitous`、`#idempotent`、`#deprecated` の順にダブルクリックし、それぞれ意味が入るのを待って保存する。`idempotent` だけ、メモに `冪等` と書いてから保存する。
- **新しい順。** `#toggle-list` をクリックする。`verify.mjs run list` で、`#words > li` の `data-headword` が `deprecated`、`idempotent`、`ubiquitous` の順になることを確かめる。
- **詳細。** `idempotent` の `summary` をクリックする。`details` が開き、`Wiktionary` と `メモ` のラベル、意味、メモ `冪等`、文脈 1 件（`単語 The API is ubiquitous and idempotent.`）が出る。
- **メモのない単語。** `ubiquitous` の `summary` をクリックする。メモの欄（`.note`）が出ない。
- **削除。** `ubiquitous` の `.delete` をクリックし、確認をキャンセルすると 3 語のまま。もう一度クリックして承認すると、`ubiquitous` だけが一覧と保存の中身から消える。
- **証跡。** `list-page.png` と `list-panel.png` に、最後の状態が残る。

## Gotchas

- 一覧の項目は `#words > li` で数える。`#words li` だと、詳細の中の文脈の `li` まで数えてしまう。
- 確認のダイアログは `clickInPanel(selector, { dialog: true })` で承認、`{ dialog: false }` でキャンセルする。指定しないと、ダイアログが出たまま止まる。
- 削除すると一覧が描き直されるので、開いていた詳細は閉じる。
