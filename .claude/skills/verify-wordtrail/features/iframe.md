# iframe の中の語を選ぶ

ページに埋め込まれた iframe の中の単語をダブルクリックしても、パネルにその単語が出る。文は iframe の中から取り、URL は iframe ではなく、タブで開いているページのものを出す。claude.ai の Artifact のように、本文が iframe の中に表示されるページで使う。

## Sub-features

- `iframe-word` は、iframe の中の語をパネルに出す。
- `iframe-sentence` は、文を iframe の中の段落から取る。
- `iframe-url` は、URL をタブのページのものにする。

## How to get to it (user POV)

- 本文が iframe の中にあるページで、単語をダブルクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- ジャーニーの最初に `openPanel` でパネルのページを開いておく。

- **iframe の中の語。** 試験用ページの iframe（`/frame`）の `#framed` をダブルクリックする。`verify.mjs run iframe` で、`#word` が `serendipity` になることを確かめる。
- **文。** `#sentence` が `Inside the frame, serendipity happens.` になる。
- **URL。** `#url` が iframe の `/frame` ではなく、試験用ページの URL になる。
- **証跡。** `iframe-page.png` と `iframe-panel.png` に、最後の状態が残る。

## Gotchas

- 試験用の iframe は同じオリジン（`/frame`）にある。claude.ai の Artifact は別のオリジンの iframe なので、別オリジンでの挙動は普段の Chrome で確かめる。コンテンツスクリプトが iframe に入るかどうかは `all_frames` で決まり、オリジンには左右されない。
- `dblclick` の第 2 引数に iframe のパスを渡すと、その iframe の中の要素をクリックする。`boundingBox()` は iframe の中の要素でも、ページ全体の座標を返す。
