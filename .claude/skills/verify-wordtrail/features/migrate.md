# メモの前の単語を移す

メモの欄ができる前に保存した単語は、意味の欄に辞書の定義と自分で書いたことが混ざっている。拡張を入れ直したり読み込み直したりしたときに、品詞のない意味（品詞の行を書かずに手で入力したもの）をメモに移し、品詞のある意味は Wiktionary の内容として残す（ADR-0002 の受け入れ条件 7）。何も消さない。

## Sub-features

- `migrate-note` は、品詞のない意味をメモに移す。複数あれば空行で区切る。
- `migrate-keep` は、品詞のある意味と文脈を、そのまま残す。

## How to get to it (user POV)

- メモの欄ができる前の版で単語を保存しておき、拡張を今の版に更新する（`chrome://extensions` の再読み込み）。登録済みの単語をダブルクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `writeStorageFromWorker()` をジャーニーの最初に呼ぶ。新しく入れた直後の service worker が動いている間に書き込む。

- **準備（古い形のデータ）。** `writeStorageFromWorker()` で、`ubiquitous` を古い形（`note` がなく、品詞 `adjective` の意味と、品詞のない 2 行の意味を持つ）で書き込む。今のパネルではこの形を作れないので、拡張の service worker から `chrome.storage.local` に書く。ジャーニーで `chrome.storage` に直接書き込むのは、ここだけ。
- **読み込み直し。** `reloadExtension()` で拡張を読み込み直す。`chrome.runtime.onInstalled` で移す処理が動く。
- **パネルで見る。** パネルを開き、`#ubiquitous` をダブルクリックする。`#status` が `登録済みの単語です。`、`#note` が品詞のなかった 2 行、`#meanings` が `adjective:` `Being everywhere at once.` になる。
- **保存の中身。** `savedWords()` の `ubiquitous` の意味が `adjective` の 1 件だけになり、`note` に 2 行が入り、文脈 1 件が残る。`verify.mjs run migrate` で全項目を確かめる。
- **証跡。** `migrate-page.png` と `migrate-panel.png` に、最後の状態が残る。

## Gotchas

- service worker のターゲットは、Chrome が拡張の API を結び付ける前に見えることがあり、そのときは `chrome` が未定義になる。`writeStorageFromWorker()` は `chrome` が見えるまで待ってから書く。
- 読み込み直しの後、service worker はイベントが来るまで起きない。書き込みは読み込み直しの前に済ませる。
- 移す処理を何度動かしても結果は同じ（`note` を持つ単語は変えない）。この繰り返しは `node --test` で確かめている。
- 版 1 の書き出しファイルを読み込むときの移し方は、[backup](./backup.md) で確かめている。
