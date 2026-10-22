# 保存した単語が残る

保存した単語は、拡張を読み込み直しても、Chrome を再起動しても残る。読み込み直しや再起動の後に同じ単語をダブルクリックすると、登録済みと出て、保存した意味とメモが出る。

## Sub-features

- `persist-reload` は、拡張を読み込み直した後も単語が残る。
- `persist-restart` は、Chrome を再起動した後も単語が残る。

## How to get to it (user POV)

- `chrome://extensions` で Wordtrail を読み込み直してから、保存した単語をダブルクリックする。
- Chrome を終了して起動し直してから、保存した単語をダブルクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（最初の登録で意味が入るのを待つため）。

- **登録。** パネルを開き、`#ubiquitous` をダブルクリックし、意味が入るのを待ってから、メモに `どこにでもある` と書いて保存する。
- **読み込み直し。** `reloadExtension()` で拡張を読み込み直す。開いていたパネルのタブが閉じることを確かめる（読み込み直しが空振りしていない証拠）。パネルを開き直して `#ubiquitous` をダブルクリックし、`#status` が `登録済みの単語です。`、意味とメモが保存したものになることを `verify.mjs run persist` で確かめる。
- **再起動。** `restartChrome()` で同じプロファイルのまま Chrome を起動し直し、同じことを確かめる。
- **証跡。** `persist-page.png` と `persist-panel.png` に、最後の状態が残る。

## Gotchas

- `chrome://extensions` の再読み込みボタンは shadow DOM の中にあるので押さない。代わりに `browser.installExtension()` で同じフォルダを読み込み直す。`chrome.runtime.reload()` は、puppeteer が読み込んだ拡張では読み込み直されずに止まるので使わない。
- MV3 の service worker は、読み込み直しや再起動の直後には起動せず、イベントが来て初めて動く。worker の起動を待つのは最初の起動のときだけにし、拡張の ID はそのとき取ったものを使い回す。
- 読み込み直すと、ページに残った古いコンテンツスクリプトが `Extension context invalidated` になる。普段の使い方と同じく、読み込み直しの後にページを再読み込みする。
