# 意味を入れる

単語をダブルクリックすると、パネルの新規登録の画面に、小文字にした見出し語と、英英辞書から引いた意味が出る。意味は品詞ごとに最初の 2 個まで。辞書から取れなかったとき（見つからない、通信の失敗、10 秒の時間切れ）は、意味の欄に手で入力するよう案内が出る。

## Sub-features

- `meanings-headword` は、見出し語を小文字で出す。
- `meanings-lookup` は、辞書の意味を品詞ごとに 2 個まで出す。
- `meanings-missing` は、辞書から取れなかったときに、手での入力を案内する。

## How to get to it (user POV)

- パネルを開いた状態で、読んでいるページの単語をダブルクリックする。
- パネルが閉じた状態でダブルクリックしてから、パネルを開く。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `api.dictionaryapi.dev` につながる。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **小文字の見出し語。** `#running`（`Running`）をダブルクリックする。`verify.mjs run meanings` で、`#word` が `running` になることを確かめる。
- **品詞ごとの意味。** `#meanings` の最初の品詞が `verb`、その 1 個目が `To move swiftly.` になり、どの品詞も意味が 2 個以下になる。
- **文と URL。** `#sentence` が `Running is good exercise.`、`#url` が試験用ページの URL になる。
- **証跡。** `meanings-page.png` と `meanings-panel.png` に、最後の状態が残る。

## Gotchas

- `meanings-missing` はこのジャーニーでは確かめない。見つからない語の問い合わせは、2026-10-18 時点で API が 404 を返さず、10 秒の時間切れまで待つことになるため。
- パネルのタブはページの裏にあるので、`waitForFunction` を既定の `requestAnimationFrame` で待つと条件が一度も評価されない。`polling` に間隔を指定する。
- 意味の期待値は本物の辞書の内容に依存する。辞書の内容が変わったら、まず `test/fixtures/dictionary-running.json` を取り直して比べる。
