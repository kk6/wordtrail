# 英辞郎を取り込む

一覧の画面の **英辞郎を取り込む** で、購入した英辞郎のテキストファイル（Shift JIS）を選ぶと、1 語の見出し語の訳がブラウザの中に取り込まれる。取り込み中はボタンが押せず、終わると語数とファイル名が出る。パネルを開き直しても、語数とファイル名が出る。取り込み直すと前のデータは置き換わり、英辞郎でないファイルを選んだときは失敗と出て、前のデータが残る。英辞郎のデータは再配布できないので、リポジトリには置かない（ADR-0003）。

## Sub-features

- `eijiro-import-progress` は、取り込み中にボタンを押せなくし、取り込み中と出す。
- `eijiro-import-done` は、取り込んだ語数とファイル名を出し、開き直しても出す。
- `eijiro-import-replace` は、取り込み直すと前のデータを置き換える。
- `eijiro-import-reject` は、英辞郎の行がないファイルを拒否し、前のデータを残す。

## How to get to it (user POV)

- パネル上部の **一覧** を開き、**英辞郎を取り込む** をクリックして、テキストファイルを選ぶ。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- 本物の英辞郎は使わない。自作の `test/fixtures/eijiro-sample.txt`（Shift JIS、9 行、取り込むのは 5 語）を使う。

- **取り込む前。** パネルを開いて一覧に移る。`verify.mjs run eijiro-import` で、`#eijiro-status` が `英辞郎は取り込んでいません。` になる。
- **取り込み。** `watchPanelStatus("#eijiro-status", "#eijiro")` で状態の移り変わりを記録してから、`chooseFileInPanel("#eijiro", …)` でサンプルを選ぶ。途中にボタンが押せない `英辞郎を取り込んでいます…` があり、最後はボタンが押せる `英辞郎：5 語（eijiro-sample.txt）` になる。`eijiroKeys()` が `colour`、`don't`、`run`、`sample-word`、`us` になる。
- **開き直し。** `reopenPanel()` の後に一覧に移ると、同じ語数とファイル名が出る。
- **置き換え。** `apple` だけの `replacement.txt` を選ぶと、`英辞郎：1 語（replacement.txt）` になり、`eijiroKeys()` が `apple` だけになる。
- **拒否。** `not-eijiro.json` を選ぶと、`#eijiro-status` が `取り込めませんでした` で始まり、`eijiroKeys()` は `apple` のまま。開き直すと `英辞郎：1 語（replacement.txt）` が出る。
- **証跡。** `eijiro-import-page.png`、`eijiro-import-panel.png`、`replacement.txt`、`not-eijiro.json` が残る。

## Gotchas

- 取り込み中の状態はサンプルでは一瞬で終わるので、ポーリングでは捕まらない。`watchPanelStatus()` は MutationObserver で変化をすべて記録する。
- `■` は ASCII ではない。試験用のファイルを UTF-8 の文字列のまま書くと、Shift JIS として読めずに拒否される。`replacement.txt` は `■` だけを Shift JIS のバイト（`0x81 0xA1`）で書く。
- `eijiroKeys()` は取り込みの後にだけ呼ぶ。まだないデータベースを開くと、空のまま作ってしまい、拡張が表を作れなくなる。
- 本物の英辞郎のファイルを `artifacts/` や `test/` に置かない。`.gitignore` は `EIJIRO*[0-9].TXT` だけを外す。
