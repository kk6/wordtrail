# 英辞郎の欄

英辞郎を取り込んだ後は、パネルの Wiktionary の欄の上に「英辞郎」の欄が出る。パネルの見出し語を大文字と小文字を区別せずに引き、訳を品詞ごとに番号付きで並べる。品詞の番号（`自動-1` の `-1`、`1-動` の `1-`）は外す。引いた語と綴りが違う見出し語（`us` で引いたときの `US`）には、元の綴りが付く。見出し語を直して欄を離れると引き直す。取り込む前は欄が出ず、取り込んだ後に見つからない語では、見つからなかったと出る。訳はそのつど引くだけで、単語帳にも書き出すファイルにも入らない（ADR-0003）。

## Sub-features

- `eijiro-panel-hidden` は、取り込む前に英辞郎の欄を出さない。
- `eijiro-panel-missing` は、取り込んだ後に見つからない語で、見つからなかったと出す。
- `eijiro-panel-show` は、Wiktionary の欄の上に、品詞ごとに番号付きで訳を出す。書き換えられない。
- `eijiro-panel-relookup` は、見出し語を直して欄を離れると、大文字と小文字を区別せずに引き直す。
- `eijiro-panel-spelling` は、綴りが違う見出し語に元の綴りを添える。
- `eijiro-panel-not-saved` は、保存した単語と書き出すファイルに英辞郎の訳を入れない。
- `eijiro-panel-registered` は、登録済みの単語を開いたときも、一覧から開いたときも、訳をその場で引いて出す。

## How to get to it (user POV)

- 英辞郎を取り込んだ後（[英辞郎を取り込む](./eijiro-import.md)）、ページの単語をダブルクリックする。
- パネルの見出し語の欄を書き換えて、欄を離れる。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（保存の前に Wiktionary を引き終えるのを待つため）。
- 本物の英辞郎は使わない。自作の `test/fixtures/eijiro-sample.txt` を使う。試験用ページに `run` や `us` はないので、見出し語を書き換えて引く。

- **取り込む前。** `#ubiquitous` をダブルクリックする。`verify.mjs run eijiro-panel` で、`#eijiro-section` が隠れていて、`panelTags()` に `英辞郎` がない。
- **見つからない語。** 一覧から `chooseFileInPanel("#eijiro", …)` でサンプルを取り込み、`#running` をダブルクリックする。`#translations` が `英辞郎に見つかりませんでした。` になる。`panelTags()` の先頭が `英辞郎`、`Wiktionary` の順で、`panelEditables()` は `word` と `note` だけ。
- **引き直し。** `typeInPanel("word", "Run")` で、`#translations` が `自動:` `1. 〔人が〕走る` `他動:` `1. 〔店を〕営む` になる。
- **綴り。** `us` にすると `US 略:` `1. 合衆国` `代名:` `1. 私たちを` になる。
- **参照。** `colour` にすると `名:` `1. ＝<→color>` になる。
- **保存と書き出し。** そのまま保存すると、`savedWords()` に `colour` があり、`＝<→color>` は含まれない。一覧の `#export` で書き出したファイルにも含まれない。
- **登録済み。** `#idempotent` をダブルクリックして見出し語を `colour` にすると、登録済みの `colour` が出て、`#translations` が `名:` `1. ＝<→color>` になる。
- **一覧から開く。** 一覧で `colour` の `.open` をクリックすると、いちばん上のラベルが `英辞郎` で、`#translations` が同じ訳になる。
- **証跡。** `eijiro-panel-page.png`、`eijiro-panel-panel.png`、`downloads/` の書き出したファイルが残る。

## Gotchas

- 英辞郎の欄は IndexedDB から引くので、Wiktionary とは別に遅れて出る。見出し語を書き換えた後に少し待ってから `#translations` を読む。
- 英辞郎の欄が見つからなかったと出るのは取り込んだ後だけ。取り込む前は欄ごと隠れるので、`#translations` の文字を見ても判断できない。`#eijiro-section` の `hidden` を見る。
