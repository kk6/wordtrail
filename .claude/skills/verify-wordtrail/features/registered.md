# 登録済みの単語にまた出会う

登録済みの単語をダブルクリックすると、パネルには新規登録ではなく、保存してある見出し語、Wiktionary の意味、メモ、これまでの文脈が出る。Wiktionary は引き直さない。今の文と URL は、保存しなくてもダブルクリックした時点で文脈に足され、同じ文なら足されない。大文字と小文字は区別しない。

## Sub-features

- `registered-show` は、登録済みと表示し、保存した見出し語と意味とメモを出す。
- `registered-context` は、ダブルクリックした時点で文脈を足す（パネルが閉じていても足す）。
- `registered-dedupe` は、同じ文では文脈を足さない。

## How to get to it (user POV)

- 前に保存した単語を、別の記事でダブルクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（最初の登録で意味が入るのを待つため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **登録。** `#ubiquitous` をダブルクリックし、意味が入るのを待ってから、メモに `どこにでもある` と書いて保存する。
- **別のページで出会う。** `goto("/other")` で別の記事に移り、文頭の `#again`（`Ubiquitous`）をダブルクリックする。`verify.mjs run registered` で、`#status` が `登録済みの単語です。`、意味とメモが保存したものになり、`watchPanelRequests()` で見て `en.wiktionary.org` への通信がなく、`#contexts` と保存の中身の文脈が 2 件になることを確かめる。
- **同じ文。** `#again` をもう一度ダブルクリックしても、文脈は 2 件のまま。
- **証跡。** `registered-page.png` と `registered-panel.png` に、最後の状態が残る。

## Gotchas

- 文脈を足すのは background で、パネルは保存の中身を読むだけ。パネルが閉じた状態での `registered-context` は、このジャーニーでは確かめていない。
- 見出し語を書き換えて保存した語（`running` を `run` で保存）は、元の `running` をダブルクリックしても登録済みにならない。活用形は別の単語として扱う決まり（README）。
