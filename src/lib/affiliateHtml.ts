const SPONSORED_REL = "sponsored nofollow noopener";

/**
 * ASP の HTML に含まれるアンカーへ、広告リンクの属性を付ける。
 * 既に rel や target があっても、こちらの値で揃える。
 */
export function sponsorizeAnchors(html: string): string {
  return html.replace(/<a\b([^>]*?)>/gi, (_full, attrs: string) => {
    const cleaned = attrs.replace(
      /\s(?:rel|target)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    );
    return `<a${cleaned} rel="${SPONSORED_REL}" target="_blank">`;
  });
}
