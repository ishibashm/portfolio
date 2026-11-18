/**
 * 広告 Cookie の選択。
 *
 * サーバーへは送らない。この端末の localStorage にだけ残す。
 * 「同意する」まではパーソナライズ広告にしない（欧州経済領域・英国と、
 * 日本の外部送信の説明を、選択の前に出すため）。
 *
 * 審査用の AdSense スクリプト自体は head に残す。スクリプトを同意の
 * クリックまで消すと、所有確認がスクリプトを見られなくなる。
 * パーソナライズの有無だけを、スクリプトより前の bootstrap で決める。
 */

export const AD_CONSENT_STORAGE_KEY = "cp_ad_consent";

export type AdConsentChoice = "granted" | "denied" | "unknown";

export function parseAdConsent(
  value: string | null | undefined,
): AdConsentChoice {
  if (value === "granted" || value === "denied") return value;
  return "unknown";
}

/** granted のときだけパーソナライズを許す。未選択と拒否は非パーソナライズ。 */
export function allowsPersonalizedAds(choice: AdConsentChoice): boolean {
  return choice === "granted";
}

/**
 * adsbygoogle.js より前に実行する。選択が granted でなければ
 * requestNonPersonalizedAds を立てる。
 */
export const AD_CONSENT_BOOTSTRAP = `(function(){try{var v=localStorage.getItem(${JSON.stringify(AD_CONSENT_STORAGE_KEY)});window.adsbygoogle=window.adsbygoogle||[];if(v!=="granted"){window.adsbygoogle.requestNonPersonalizedAds=1;}}catch(e){}})();`;
