# 読み上げる

見出し語の横と、文脈の文の横にある ▶ をクリックすると、その語や文をブラウザ内蔵の音声で英語として読み上げる。これまでの文脈と、一覧の見出し語と文脈にもそれぞれ ▶ がある。一覧の見出し語の ▶ を押しても、その単語は開いたり閉じたりしない。通信はしない。読み上げ中に別の ▶ をクリックすると、前の読み上げを止めて新しいほうを読む。

## Sub-features

- `speak-word` は、見出し語の欄の今の値を読み上げる。
- `speak-sentence` は、表示中の文脈の文を読み上げる。
- `speak-history` は、これまでの文脈と一覧の文脈の、それぞれの文を読み上げる。
- `speak-list-word` は、一覧の見出し語を読み上げ、その単語の開閉を変えない。
- `speak-voice` は、英語の声が使える状態であること。Samantha があれば Samantha で読む（`lang` だけだと、macOS の Chrome は en-US の先頭の Albert を選ぶ）。

## How to get to it (user POV)

- 単語をダブルクリックしてパネルに出た見出し語か文の横の ▶ をクリックする。
- 登録済みの単語のこれまでの文脈の ▶ をクリックする。
- 一覧で見出し語の横の ▶ をクリックする。
- 一覧で単語を開き、文脈の ▶ をクリックする。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる（意味が入るのを待ってから保存するため）。
- ジャーニーの最初に `openPanel` でパネルのページを開き、`watchPanelSpeech` でパネルが `speechSynthesis.speak` に渡したものを記録する。記録した後は本物の `speak` を呼ぶので、実際に音が出る。

- **見出し語。** `verify.mjs run speak` で `#ubiquitous` をダブルクリックし、`#speak-word` をクリックする。`ubiquitous` を `en-US` で読み上げ、読み上げが始まる（`start` が来る）。
- **英語の声。** クリックの後で、`speechSynthesis.getVoices()` に `en` で始まる声があることを確かめる。その中に Samantha があれば、見出し語は Samantha で読んでいる（`utterance.voice?.name`）。`getVoices()` をクリックより前に呼ばないので、パネルを開いて最初のクリックでも Samantha を選べることを確かめている。
- **文脈の文。** `#speak-sentence` をクリックする。`単語 The API is ubiquitous and idempotent.` を読み上げる。
- **これまでの文脈。** 保存してから `goto("/other")` で `#again` をダブルクリックし、`#contexts` の 1 件目の ▶ をクリックする。表示中の文ではなく、前の記事の文を読み上げる。
- **一覧の見出し語。** 一覧で閉じたままの `ubiquitous` の見出し語の ▶ をクリックする。`ubiquitous` を読み上げ、単語は閉じたまま。
- **一覧の文脈。** 一覧で `ubiquitous` を開き、2 件目の ▶ をクリックする。`Ubiquitous sensors now watch every street.` を読み上げる。
- **開いた単語の見出し語。** 開いたまま見出し語の ▶ をもう一度クリックする。`ubiquitous` を読み上げ、単語は開いたまま。
- **証跡。** `speak-page.png` と `speak-panel.png` に、最後の状態（一覧）が残る。

## Gotchas

- ボタンは `clickInPanel` の本物のクリックで押す。`evaluate` で `click()` を呼ぶと、ユーザー操作の扱いが本物と変わる。
- 声は読み込みが遅れて届くので、`getVoices()` は少し待ってから見る。空のまま失敗したら、macOS の読み上げの声が入っているかを確かめる。
- 一覧の見出し語の ▶ は `<summary>` の中にある。Chrome は summary の中のボタンのクリックでは details を開閉しないので、`preventDefault` は要らない。`<span>` にすると開閉してしまい、このジャーニーが落ちる（確かめ済み）。
- Samantha がない環境では、声の名前は確かめない（`lang` だけで読む）。
- 聞こえ方（発音の正しさ、実際に Samantha の声に聞こえるか）と、読み上げ中に別の ▶ を押したときに前の読み上げが止まることは確かめていない。確かめるのは、どの文を英語として渡したかと、読み上げが始まったかまで。
