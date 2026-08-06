/**
 * プロフィールの保存先の表示。
 *
 * QA #16。パネル右上が常に "LOCAL MODE ONLY" 固定で、ログインしてクラウドに
 * 同期されていても「この端末だけ」と読めていた。
 *
 * 同じ状態を、パネル右上とプリセット欄のバッジの 2 か所で出している。
 * 別々に書くと文言が割れるので、両方ここから引く。
 */
export type ProfileStorageTone = "synced" | "local" | "unknown";

export interface ProfileStorageMode {
  label: string;
  tone: ProfileStorageTone;
}

export function getProfileStorageMode(
  cloudSynced: boolean | null,
  needsLogin: boolean,
): ProfileStorageMode {
  if (cloudSynced === null) return { label: "同期確認中", tone: "unknown" };
  if (cloudSynced) return { label: "クラウド同期済み", tone: "synced" };
  return {
    label: needsLogin ? "この端末のみ（未ログイン）" : "この端末のみ",
    tone: "local",
  };
}
