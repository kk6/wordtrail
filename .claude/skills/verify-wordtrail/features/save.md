# 書き換えて保存する

パネルの見出し語と意味は書き換えられ、**保存** で単語帳に入る。意味はテキストで編集し、`verb:` のように `:` で終わる行が品詞、その下の行がその品詞の意味になる。見出し語は小文字にしたものをキーにして保存し、文脈には、ダブルクリックしたときの文とページの URL が 1 件入る。

## Sub-features

- `save-edit` は、見出し語と意味を書き換えて保存する。
- `save-context` は、ダブルクリックしたときの文と URL を文脈として保存する。
- `save-empty` は、見出し語が空なら保存せず、入力を促す。

## How to get to it (user POV)

- パネルに単語が出た状態で、見出し語と意味の欄を書き換え、**保存** をクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（意味が入るのを待ってから書き換えるため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **書き換え。** `#running` をダブルクリックし、意味が入るのを待つ。`typeInPanel` で見出し語を `run` に、意味を `verb:` `走る` と `noun:` `走ること` に打ち直し、`#save` をクリックする。`verify.mjs run save` で、`#status` が `保存しました。` になることを確かめる。
- **保存の中身。** `savedWords()` の `run` が、見出し語 `run`、書き換えた 2 つの品詞の意味、文 `Running is good exercise.` と試験用ページの URL の文脈 1 件になる。
- **証跡。** `save-page.png` と `save-panel.png` に、最後の状態が残る。

## Gotchas

- 保存の中身は、一覧の画面（T5）ができるまで、パネルのページから `chrome.storage.local` を読んで確かめる。読むだけで、書き込みはしない。一覧ができたら、一覧の画面で確かめる形に替える。
- `chrome.storage` から読んだオブジェクトはキーの順番が変わるので、`JSON.stringify` で比べない。`isDeepStrictEqual` を使う。
- `save-empty` はこのジャーニーでは確かめていない。
- 入力はパネルのタブを前面に出してから、本物のキー入力で行う。`value` を直接書き換えない。
