# 拡張の ID を固定する

`extension/` を読み込み直しても、別の場所から読み込んでも、拡張の ID は変わらない。単語帳は ID ごとに保存されるので、ID が変わると、ユーザーからは単語帳が空になったように見える。

## Sub-features

- `id-from-key` は、ID が `manifest.json` の `key` から決まる値になる。
- `id-across-profiles` は、別のプロファイルで読み込んでも同じ ID になる。

## How to get to it (user POV)

- `chrome://extensions` で拡張を再読み込みする、またはフォルダを読み込み直す。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が、`key` から計算した ID を表示する。

- **key から決まる。** `verify.mjs run stable-id` で、読み込んだ拡張の ID が `doctor` の表示と一致することを確かめる。
- **プロファイルをまたいでも同じ。** 同じジャーニーの中で、2 つ目の一時プロファイルに読み込み、ID が一致することを確かめる。
- **証跡。** `result.json` に 2 項目の合否が残る。画面の証跡はない。

## Gotchas

- `manifest.json` の `key` を消すか作り直すと、ID が変わる。普段の Chrome の単語帳は古い ID に残ったまま見えなくなる。`key` は変えない。
