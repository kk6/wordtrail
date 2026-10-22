# 見出し語を直して引き直す

新規登録の画面で見出し語を直して欄を離れると（`running` を `run` にした場合など）、Wiktionary の欄が、直した語で引いた結果になる（ADR-0002 の受け入れ条件 4）。入力の途中では引かない。直した語が登録済みなら、引き直さずにその語の保存内容に切り替わる（[rename](./rename.md)）。引き直している間に **保存** を押しても、引き終わるのを待ってから、直した語の意味で保存する。

## Sub-features

- `relookup-on-leave` は、見出し語の欄を離れたときだけ、直した語で Wiktionary を引き直す。
- `relookup-not-while-typing` は、入力の途中では Wiktionary に問い合わせない。
- `relookup-save-waits` は、引き直しの途中で保存しても、別の語の意味を保存しない。

## How to get to it (user POV)

- 単語をダブルクリックし、パネルの見出し語を未登録の別の語に直して、欄を離れる（Tab かクリック）。

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor` が `doctor: OK` を出す。
- `en.wiktionary.org` につながる。
- ジャーニーの最初に `openPanel` でパネルのページを開き、`watchPanelRequests()` でパネルから `en.wiktionary.org` への通信を記録する。

- **準備。** `#running` をダブルクリックし、意味が入るのを待つ。通信は `/running` の 1 件。
- **入力の途中。** `typeInPanel("word", "run", { leave: false })` で欄にとどまったまま打ち、1.5 秒待つ。通信は 1 件のまま、`#meanings` も `running` の内容のまま。
- **欄を離れる。** `leavePanelField()` で Tab を押す。通信が 2 件になり、2 件目が `/run`、`#meanings` が `run` の内容（`verb:` を含み、`present participle and gerund of run` を含まない）になる。見出し語を直したので `#unsaved` が出る。
- **引き直しの途中で保存。** `slowPanelNetwork(3000)` でパネルの通信を遅くし、見出し語を `work` に直して欄を離れる。`#meanings` が `Wiktionary を引いています…` のうちに `#save` をクリックする。引き終わった後、`#status` が `保存しました。` で、保存の中身の `work` の意味が `#meanings` に出た `work` の内容と一致し、`run` と `running` は登録されない。`verify.mjs run relookup` で全項目を確かめる。
- **証跡。** `relookup-page.png` と `relookup-panel.png` に、最後の状態が残る。

## Gotchas

- `typeInPanel` は打ち終わりにページのタブを前に出す。パネルのタブが裏に回ると、入力欄からフォーカスが外れて `change` が起きるので、欄にとどまる確認では `{ leave: false }` でパネルを前に置いたままにする。
- `slowPanelNetwork` は CDP の `Network.emulateNetworkConditions` で、パネルのページの通信だけを遅くする。終わったら `slowPanelNetwork(0)` で戻す。
- 引き直しで、これまでの文脈の欄は空になる。新規の語から始めるこのジャーニーでは、もともと空なので確かめていない。
