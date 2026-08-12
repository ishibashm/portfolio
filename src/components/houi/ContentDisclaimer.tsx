/**
 * 記事ページの末尾に置く注記。
 *
 * 免責は /terms /privacy /about には書いてあるが、検索から人が来るのは
 * `/houi` 配下の 465 ページで、そこには何も無かった。方位の説明には
 * 「健康運の低下」「関節や腰の不調」のように体調に触れる語が出るため、
 * 助言ではなく古典の考え方の紹介であることを、読む場所に書いておく。
 *
 * 広告を載せるページでもあるので、体調・金銭に関する判断の根拠として
 * 使われない形にしておきたい。
 */
export function ContentDisclaimer() {
  return (
    <aside className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h2 className="text-xs font-bold text-slate-700">このページの位置づけ</h2>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        ここに書いた吉凶は、九星気学という古典的な考え方にもとづく
        <b>参考情報</b>です。医療・健康・法律・投資に関する助言ではありません。体調や金銭の判断は、それぞれの専門家にご相談ください。
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        方位の判定は、生年月日と出発地（いま住んでいる場所）で変わります。このページは本命星だけで引ける早見表なので、実際に動く前にご自身の出発地を入れて確認してください。引越しは契約・費用・通勤など現実の条件が優先されます。方位はその中の一つの目安としてお使いください。
      </p>
    </aside>
  );
}
