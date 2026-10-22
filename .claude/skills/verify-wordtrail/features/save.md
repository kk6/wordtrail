# 書き換えて保存する

パネルの見出し語とメモは書き換えられ、**保存** で単語帳に入る。Wiktionary の欄に出ている意味も、そのまま一緒に保存される。見出し語を直して欄を離れると、直した語で Wiktionary を引き直すので（[relookup](./relookup.md)）、保存される意味は直した語のもの。見出し語は小文字にしたものをキーにして保存し、文脈には、ダブルクリックしたときの文とページの URL が 1 件入る。

## Sub-features

- `save-edit` は、見出し語を直し、メモを書いて保存する。Wiktionary の欄の意味も一緒に入る。
- `save-context` は、ダブルクリックしたときの文と URL を文脈として保存する。
- `save-empty` は、見出し語が空なら保存せず、入力を促す。

## How to get to it (user POV)

- パネルに単語が出た状態で、見出し語とメモの欄を書き換え、**保存** をクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（意味が入るのを待ってから書き換えるため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **書き換え。** `#running` をダブルクリックし、意味が入るのを待つ。`typeInPanel` で見出し語を `run` に打ち直し、引き直した意味が入るのを待つ。メモに `走る` と `走ること` の 2 行を書き、`#save` をクリックする。`verify.mjs run save` で、`#status` が `保存しました。` になることを確かめる。
- **保存の中身。** `savedWords()` の `run` が、見出し語 `run`、書いたメモ、Wiktionary の欄に出ていた `run` の意味（`running` の `present participle and gerund of run` ではない）、文 `Running is good exercise.` と試験用ページの URL の文脈 1 件になる。
- **証跡。** `save-page.png` と `save-panel.png` に、最後の状態が残る。

## Gotchas

- 保存の中身は、パネルのページから `chrome.storage.local` を読んで確かめる（`savedWords()`）。文脈の URL は一覧の画面にも出るが、値をそのまま比べるため、読むだけで使っている。書き込みはしない。
- `chrome.storage` から読んだオブジェクトはキーの順番が変わるので、`JSON.stringify` で比べない。`isDeepStrictEqual` を使う。
- `save-empty` はこのジャーニーでは確かめていない。
- 入力はパネルのタブを前面に出してから、本物のキー入力で行う。`value` を直接書き換えない。
