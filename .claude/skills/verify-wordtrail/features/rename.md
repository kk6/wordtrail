# 見出し語を登録済みの語に変える

パネルで見出し語を、すでに登録してある別の語に書き換えて欄を離れると、編集画面がその語の保存内容（意味とこれまでの文脈）に切り替わり、そのことが注意の色（赤）で出る。保存すると、その語の意味は上書きされず、今の文が文脈に足される。`running` を見つけて、登録済みの `run` に直すときの動き。

## Sub-features

- `rename-switch` は、登録済みの語に書き換えると、その語の保存内容に切り替える。
- `rename-keep` は、保存しても切り替えた先の意味を上書きせず、今の文を文脈に足す。

## How to get to it (user POV)

- 単語をダブルクリックし、パネルの見出し語を登録済みの語に書き換えて、欄を離れる（Tab かクリック）。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（意味が入るのを待つため）。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **登録。** `#ubiquitous` の意味を `adjective:` `どこにでもある` に打ち直して保存する。
- **書き換え。** 別の文の `#deprecated` をダブルクリックし、意味が入るのを待ってから、見出し語を `ubiquitous` に打ち直して Tab で欄を離れる。`verify.mjs run rename` で、意味の欄が `ubiquitous` の保存内容になり、`#contexts` が 1 件、`#status` に `登録済みの「ubiquitous」` が `warning` の class 付きで出ることを確かめる。
- **保存。** `#save` をクリックする。保存の中身の `ubiquitous` の意味は `どこにでもある` のままで、文脈が 2 件（2 件目は `The U.S. team has deprecated the old API.`）になり、`deprecated` は登録されない。
- **証跡。** `rename-page.png` と `rename-panel.png` に、最後の状態が残る。

## Gotchas

- 切り替えは見出し語の欄の `change` で起きる。`typeInPanel` は打ち終わりに Tab を押して欄を離れる。
- 登録済みの語（`goalkeeper`）を開いて別の登録済みの語（`goal`）に書き換えたとき、元の `goalkeeper` は残る。2026-10-22 に、この動きでよいと決めた。
- 試験用ページの `#ubiquitous` と `#idempotent` は同じ文にあるので、文脈が増えることを確かめるには別の文の語（`#deprecated`）を使う。
