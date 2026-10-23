-- 運営者の個人情報（移転の日付・経路・生年月日の干支）を含む 2 記事を消す。
-- content/blog/*.md の削除だけでは本番は変わらない（DB に行があれば DB が正）。
-- 行を消すと loadBlogPost は 404 を返す（DB に他の記事がある限り Markdown に落ちない）。
--
-- あわせて、他の記事の本文から消した記事へのリンクを外す。ファイル側と同じ
-- 置き換えを replace() で当てる。管理画面での他の編集は残る。
-- **二度当てても同じ結果になる**（消えた行・置き換え済みの文字列には何も起きない）。

DELETE FROM "BlogPost" WHERE slug IN ('moved-to-an-unlucky-direction', 'one-birthdate-through-all-mcp-tools');

UPDATE "BlogPost" SET content = replace(content, E'すでに凶方位へ移動してしまった場合の考え方は、[凶方位へ移動してしまった場合](/blog/moved-to-an-unlucky-direction)に書きました。運営者自身の移動（京都→名古屋）を計算した記録です。\n\n', E'') WHERE slug = 'does-bad-direction-last-60-years' AND strpos(content, E'すでに凶方位へ移動してしまった場合の考え方は、[凶方位へ移動してしまった場合](/blog/moved-to-an-unlucky-direction)に書きました。運営者自身の移動（京都→名古屋）を計算した記録です。\n\n') > 0;
UPDATE "BlogPost" SET content = replace(content, E'理由は、[凶方位へ移動してしまった場合](/blog/moved-to-an-unlucky-direction)にも書いたとおりです。**効果', E'理由は、**効果') WHERE slug = 'can-good-outweigh-a-bad-move' AND strpos(content, E'理由は、[凶方位へ移動してしまった場合](/blog/moved-to-an-unlucky-direction)にも書いたとおりです。**効果') > 0;
UPDATE "BlogPost" SET content = replace(content, E'転勤で動いた場合の扱いは[凶方位へ動いたあとの扱い](/blog/moved-to-an-unlucky-direction)に書きました。', E'') WHERE slug = 'tenchusatsu-names-and-schools' AND strpos(content, E'転勤で動いた場合の扱いは[凶方位へ動いたあとの扱い](/blog/moved-to-an-unlucky-direction)に書きました。') > 0;
UPDATE "BlogPost" SET content = replace(content, E'動いてしまったあとの読み方は[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)にあります。', E'動いてしまったあとの読み方は[次の移動で挽回できるのか](/blog/can-you-recover-from-honmei-teki)にあります。') WHERE slug = 'tenchusatsu-origin-and-what-not-to-do' AND strpos(content, E'動いてしまったあとの読み方は[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)にあります。') > 0;
UPDATE "BlogPost" SET content = replace(content, E'そちらは[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)と[次の移動で挽回できるのか](/blog/can-you-recover-from-honmei-teki)に分けて書きました。', E'そちらは[次の移動で挽回できるのか](/blog/can-you-recover-from-honmei-teki)に分けて書きました。') WHERE slug = 'moving-during-tenchusatsu' AND strpos(content, E'そちらは[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)と[次の移動で挽回できるのか](/blog/can-you-recover-from-honmei-teki)に分けて書きました。') > 0;
UPDATE "BlogPost" SET content = replace(content, E'（[避けられない移動のあとの読み方](/blog/moved-to-an-unlucky-direction)）', E'') WHERE slug = 'tenchusatsu-and-lucky-directions' AND strpos(content, E'（[避けられない移動のあとの読み方](/blog/moved-to-an-unlucky-direction)）') > 0;
UPDATE "BlogPost" SET content = replace(content, E'（避けられなかった場合は[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)）', E'（避けられなかった場合は[次の移動で挽回できるのか](/blog/can-you-recover-from-honmei-teki)）') WHERE slug = 'who-decided-the-prohibitions' AND strpos(content, E'（避けられなかった場合は[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)）') > 0;
UPDATE "BlogPost" SET content = replace(content, E'[年盤が1年塞ぐとき、日取りをどう考えるか](/blog/year-board-blocks-a-whole-year)と[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)に書きました', E'[年盤が1年塞ぐとき、日取りをどう考えるか](/blog/year-board-blocks-a-whole-year)に書きました') WHERE slug = 'what-is-hidori-for-moving' AND strpos(content, E'[年盤が1年塞ぐとき、日取りをどう考えるか](/blog/year-board-blocks-a-whole-year)と[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)に書きました') > 0;
UPDATE "BlogPost" SET content = replace(content, E'- [凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)\n', E'') WHERE slug = 'why-bad-directions-feel-frightening' AND strpos(content, E'- [凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)\n') > 0;
UPDATE "BlogPost" SET content = replace(content, E'そのうち 10 本が', E'そのうち 9 本が') WHERE slug = 'why-bad-directions-feel-frightening' AND strpos(content, E'そのうち 10 本が') > 0;
UPDATE "BlogPost" SET content = replace(content, E'運営者自身が凶方位へ移ってしまったときの計算は、[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)にそのまま書いてあります。\n\n', E'') WHERE slug = 'honmeisatsu-anecdotes-and-life-impact' AND strpos(content, E'運営者自身が凶方位へ移ってしまったときの計算は、[凶方位へ引っ越してしまったあとに読む話](/blog/moved-to-an-unlucky-direction)にそのまま書いてあります。\n\n') > 0;
UPDATE "BlogPost" SET content = replace(content, E'同じ生年月日で公開MCPの全ツールを呼んだ例は、[ひとつの生年月日で暦・方位・刻・干支を通して見る](/blog/one-birthdate-through-all-mcp-tools)にまとめました。\n\n', E'') WHERE slug = 'numbers-in-kanshi-heirin' AND strpos(content, E'同じ生年月日で公開MCPの全ツールを呼んだ例は、[ひとつの生年月日で暦・方位・刻・干支を通して見る](/blog/one-birthdate-through-all-mcp-tools)にまとめました。\n\n') > 0;
