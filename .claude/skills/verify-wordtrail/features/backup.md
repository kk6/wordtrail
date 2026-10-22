# 書き出しと読み込み

一覧の画面の **書き出し** で、単語帳の全データが 1 つの JSON ファイル（`wordtrail-YYYY-MM-DD.json`）としてダウンロードされる。**読み込み** でそのファイルを選ぶと、確認のダイアログの後、今ある単語帳がファイルの内容で丸ごと置き換わる。形の違うファイルは理由を添えて拒否し、単語帳は変わらない。書き出すファイルは版 2 で、メモを含む。メモができる前に書き出した版 1 のファイルも読み込め、品詞のない意味はメモに移る。

## Sub-features

- `backup-export` は、全単語と全文脈を 1 つの JSON ファイルに書き出す。
- `backup-reject` は、形の違うファイルを拒否し、単語帳を変えない。
- `backup-import` は、確認のダイアログで承認したときだけ、単語帳を置き換える。
- `backup-restore` は、拡張を削除して入れ直した後でも、書き出したファイルから元に戻せる。
- `backup-version-1` は、版 1 のファイルを読み込み、品詞のない意味をメモに、品詞のある意味を Wiktionary の欄に入れる。

## How to get to it (user POV)

- パネル上部の **一覧** を開き、**書き出し** か **読み込み** をクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（登録で意味が入るのを待つため）。

- **準備。** パネルを開き、`#ubiquitous`（メモに `どこにでもある`）と `#idempotent` を保存する。`goto("/other")` で `#again` をダブルクリックし、`ubiquitous` の文脈を 2 件にする。
- **書き出し。** `downloadTo()` でダウンロード先を証跡のフォルダにし、一覧の `#export` をクリックする。`verify.mjs run backup` で、`wordtrail-YYYY-MM-DD.json` ができ、版が 2 で、その中身がメモを含めて保存の中身と一致することを確かめる。
- **拒否。** 形の違うファイル（`broken.json`）を `chooseFileInPanel("#import", …)` で選ぶ。`#list-status` が `読み込めませんでした` で始まり、保存の中身が変わらない。
- **入れ直し。** `reinstallExtension()` で拡張を削除して入れ直す。保存の中身が空になる。
- **読み込み。** 書き出したファイルを選び、確認をキャンセルすると空のまま。もう一度選んで承認すると、保存の中身が書き出す前と一致し、一覧に 2 語が出る。
- **版 1。** 品詞のある意味（`adjective:` `Being everywhere at once.`）と品詞のない意味（`どこにでもある`）を持つ `ubiquitous` だけの版 1 のファイル（`version-1.json`）を読み込んで承認する。一覧が `ubiquitous` だけになる。`#again` をダブルクリックすると、メモが `どこにでもある`、Wiktionary の欄が `adjective:` `Being everywhere at once.` になる。
- **証跡。** `backup-page.png`、`backup-panel.png`、`downloads/` の書き出したファイル、`broken.json`、`version-1.json` が残る。

## Gotchas

- 拡張の削除と入れ直しは `browser.uninstallExtension()` と `installExtension()` で行う。`manifest.json` の `key` があるので、入れ直しても ID は変わらない（変わったら例外にしている）。
- ダウンロード先は CDP の `Browser.setDownloadBehavior` で決める。指定しないと、一時プロファイルの既定の場所に落ちて見つけられない。
- ファイルの選択は `waitForFileChooser()` で受ける。`#import` は隠した `input type="file"` を開くボタン。
- 確認のダイアログは `{ dialog: true }` で承認、`{ dialog: false }` でキャンセルする。
