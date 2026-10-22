# 意味を入れる

単語をダブルクリックすると、パネルの新規登録の画面に、小文字にした見出し語と、Wiktionary から引いた意味が出る。意味は品詞ごとに最初の 2 個まで。Wiktionary の欄は読むだけで、書き換えられない。取れなかったとき（見つからない、通信の失敗、10 秒の時間切れ）は、見つからなかったと出し、メモに書くよう案内する。

## Sub-features

- `meanings-headword` は、見出し語を小文字で出す。
- `meanings-lookup` は、Wiktionary の意味を品詞ごとに 2 個まで出す。
- `meanings-missing` は、取れなかったときに、見つからなかったと出し、メモに書くよう案内する。

## How to get to it (user POV)

- パネルを開いた状態で、読んでいるページの単語をダブルクリックする。
- パネルが閉じた状態でダブルクリックしてから、パネルを開く。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **小文字の見出し語。** `#running`（`Running`）をダブルクリックする。`verify.mjs run meanings` で、`#word` が `running` になることを確かめる。
- **品詞ごとの意味。** `#meanings` の `textContent` が `verb:` と `present participle and gerund of run` の行で始まり、空行で区切ったどの品詞も意味が 2 行以下になる。
- **文と URL。** `#sentence` が `Running is good exercise.`、`#url` が試験用ページの URL になる。
- **Wiktionary にない語。** `#qwzxvbn` をダブルクリックする。`#meanings` が `Wiktionary に見つかりませんでした` で始まり、`メモに書いて` を含み、`muted` の class が付く。
- **証跡。** `meanings-page.png` と `meanings-panel.png` に、最後の状態が残る。

## Gotchas

- 通信の失敗と 10 秒の時間切れは、このジャーニーでは確かめない（`node --test` で確かめている）。
- パネルのタブはページの裏にあるので、`waitForFunction` を既定の `requestAnimationFrame` で待つと条件が一度も評価されない。`polling` に間隔を指定する。
- 意味の期待値は本物の辞書の内容に依存する。辞書の内容が変わったら、まず `test/fixtures/wiktionary-running.json` を取り直して比べる。
