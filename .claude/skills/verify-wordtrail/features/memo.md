# メモを書く

パネルには、Wiktionary の欄と、自由に書けるメモの欄が並ぶ（ADR-0002）。Wiktionary の欄は読むだけで、書き換えられない。メモは単語と一緒に保存され、登録済みの単語を開いたときにも、一覧でも出る。一覧では、Wiktionary とメモが別々のラベルで出る。

## Sub-features

- `memo-readonly` は、Wiktionary の欄を書き換えられない表示にする。編集画面で書ける欄は見出し語とメモだけ。
- `memo-save` は、メモを単語と一緒に保存し、書いている間は未保存と出す。
- `memo-show` は、登録済みの単語を開いたときと一覧で、保存したメモを出す。

## How to get to it (user POV)

- 単語をダブルクリックし、パネルの **メモ** の欄に書いて **保存** をクリックする。
- 保存した単語を別の機会にダブルクリックするか、**一覧** でその単語を開く。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（意味が入るのを待つため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **読むだけ。** `#ubiquitous` をダブルクリックし、意味が入るのを待つ。`panelEditables()` で、編集画面の書ける欄が `word` と `note` だけであることを確かめる。`clickAndTypeInPanel("#meanings", "xyz")` で Wiktionary の欄をクリックして打っても、`#meanings` の内容が変わらず、`#unsaved` も隠れたまま。
- **書いて保存。** メモに 2 行（`どこにでもある` と `覚え方: ubi = どこでも`）を書くと `#unsaved` が出る。`#save` で保存の中身の `note` がその 2 行になり、`#unsaved` が隠れる。
- **読み込み直しの後。** `reloadExtension()` の後にパネルを開き直し、`#ubiquitous` をダブルクリックする。`#note` がその 2 行、`#meanings` が保存前と同じになる。
- **一覧。** `#toggle-list` から `ubiquitous` を開く。ラベルが `Wiktionary`、`メモ` の順に出て、それぞれ意味とメモが入る。`verify.mjs run memo` で全項目を確かめる。
- **証跡。** `memo-editor-panel.png` に登録済みの単語の編集画面、`memo-panel.png` に一覧の画面が残る。

## Gotchas

- Wiktionary の欄は `<p>` なので、`typeInPanel` では打てない（`select()` がない）。読み手と同じく、クリックしてから打つ `clickAndTypeInPanel` を使う。
- 一覧の `.meanings` と `.note` は `innerText` で読む。どちらも `white-space: pre-line` なので、改行はそのまま残る。
