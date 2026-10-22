---
name: verify-wordtrail
description: Wordtrail（英語のページで単語をダブルクリックすると、サイドパネルの単語帳に出る Chrome 拡張）を、実際の Chrome に読み込んでユーザーと同じ操作で動かし、証跡を残す。拡張の挙動を変えたとき、TODO.md のタスクを完了にする前、「Chrome で確かめて」と頼まれたときに使う。
---

# Wordtrail を Chrome で確かめる

`extension/` を一時プロファイルの Chrome に読み込み、ローカルの試験用ページで単語をダブルクリックして、サイドパネルの表示を確かめる。ユーザーが触るのはページ上のダブルクリックとサイドパネルだけなので、それをそのまま操作する。`node --test` のテストは純粋な処理しか見ないので、Chrome の API をまたぐ挙動はこのスキルで確かめる。

## 起動

起動は `verify.mjs` が 1 回の実行ごとに行う。常駐させるサーバーはない。

- 準備は一度だけ行う。リポジトリのルートで `npm install` を実行する。`puppeteer-core` が入るが、Chrome 本体はダウンロードしない。インストール済みの Chrome（既定は `/Applications/Google Chrome.app`、別の場所なら `CHROME_PATH` で指定）を使う。
- 1 回の実行では、次の 3 つを新しく起動する。どれも実行が終わると片付ける。
	- `127.0.0.1` の空きポートで `fixtures/article.html` を返す HTTP サーバー（`/frame` はページに埋め込む `fixtures/frame.html`、`/other` は別の記事の `fixtures/other.html` を返す）
	- `os.tmpdir()` の下に作る空のプロファイル `wordtrail-verify-*`
	- `extension/` を読み込んだ、画面ありの Chrome。サイドパネルは画面なしでは開かない
- 拡張の service worker が起動し、試験用ページを読み込んだ時点を「使える状態」とする。
- 普段使っている Chrome のプロファイルには触れない。同時に何回実行しても、プロファイルとポートは別々になる。

## Doctor

何かおかしいと思ったら、最初にこれを実行する。読むだけで、何も変更しない。

```bash
.claude/skills/verify-wordtrail/verify.mjs doctor
```

`doctor: OK` が出れば、検証できる状態になっている。あわせて次の 2 つが表示される。

- `manifest.json` の `key` から計算した拡張の ID。`hhaojdoimahnlfholdnfhgiiolchgabl` になるはず
- 画面なしで起動した Chrome のバージョン

`NG` が出たら、その行に書かれた不足（Chrome がない、`manifest.json` がない）を直す。

## 操作

```bash
.claude/skills/verify-wordtrail/verify.mjs run <journey...>
.claude/skills/verify-wordtrail/verify.mjs run all
```

ジャーニーは機能マップの 1 機能に対応する。今あるのは `select-word`、`sentence`、`meanings`、`save`、`registered`、`rename`、`unsaved`、`persist`、`list`、`backup`、`speak`、`iframe`、`stable-id` の 13 個。各ジャーニーの手順と、何が見えれば合格かは `features/` にある。

- 操作は `page.mouse.click(..., { count: 2 })` で行う。これは本物のダブルクリックで、ユーザー操作として扱われる。`page.evaluate` で `dblclick` イベントを作るのは使わない。puppeteer は `evaluate` にユーザー操作の印を付けるので、本物の操作でなくても通ってしまう。
- ダブルクリックする場所は、試験用ページの要素の `id`（`#ubiquitous`、`#deprecated` など）で指定する。座標は書かない。
- パネルの中身は、パネルのページの `#sentence`、`#url`、`#status` の `textContent` と、入力欄の `#word` の `value` で読む（`panelText`）。意味は `#meanings` の `value` を `extension/meanings-text.js` の `parseMeanings` で読む（`panelMeanings`）。
- パネルの入力欄への入力は、`typeInPanel` で本物のキー入力として行う。
- 新しい機能を足したら、`verify.mjs` の `journeys` にジャーニーを、`features/` に同じ名前のファイルを追加する。必要なら試験用ページに要素を足す。

## 証跡

- 証跡は `artifacts/verify/<実行日時>/<journey>/` に置く。`artifacts/` は git の管理外。
	- `result.json` には、確かめた項目と合否が入る。
	- `<journey>-page.png` と `<journey>-panel.png` は、最後の操作の後のページとパネルの画面。
- 実行の最後に出る `evidence:` の行が、その回の証跡のフォルダを指す。終了コードは、全項目が合格なら 0、1 つでも不合格なら 1。
- 合格の基準は次のとおり。
	- 内部の関数を呼んだり、`chrome.storage` に直接書き込んだりせず、ページ上のダブルクリックから始める。保存の中身は、画面に出ない項目（文脈の URL など）を確かめるときだけ `savedWords()` で読む。読むだけで、書き込まない。
	- 操作の結果として、パネルに何が出たかを確かめる。最後の画面だけでなく、途中の状態（パネルが開いていない、など）も項目にする。
	- 保存の機能（T4 以降）では、パネルに表示されたことに加えて、再読み込みの後にも残っていることを確かめる。
- 辞書 API（T3 以降）は、本物の `en.wiktionary.org` に接続する。ネットワークにつながらない環境では、意味に関する項目は不合格になる。合格扱いにはしない。

## 片付け

- 各ジャーニーの終わりに、`verify.mjs` が Chrome を閉じ、HTTP サーバーを止め、一時プロファイルを削除する。例外が起きても `finally` で同じことをする。
- プロセス名で `kill` しない。途中で止めたときに Chrome が残ったら、`ps aux | grep wordtrail-verify-` で、このスキルが作ったプロファイルを使っている Chrome だけを探して止める。
- `artifacts/verify/` の証跡は片付けの対象外。不要になったら手で消す。

## ヘルパー

- `verify.mjs` は実行権限付きのスクリプトで、使い方は上の「Doctor」と「操作」に書いたとおり。引数なしで実行すると使い方を表示する。
- `fixtures/article.html` は、ジャーニーが使う試験用ページ。
