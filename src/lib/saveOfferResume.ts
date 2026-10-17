import {
  ASK_DATA_LIMITS,
  ASK_DATA_STORAGE_KEY,
  readLocalAskWorkspace,
  titleFromMessages,
  type AskConversation,
  type AskStoredMessage,
  type AskStorage,
  type AskWorkspace,
} from "@/lib/askData";

/**
 * 「結果を保存する」を押したあと、ログインから同じ会話へ戻るための下ごしらえ。
 *
 * トップのチャットは画面を開いている間しか会話を持たない。ログインで
 * ページを離れると消えてしまうので、押した時点でこの端末の相談
 * （/ask と同じ保存先）へ移しておく。サーバーには何も送らない。
 * ログイン後の同期は既存の /api/ask-data がそのまま担う。
 */

export function stashConversationForResume(
  storage: AskStorage,
  input: { id: string; messages: AskStoredMessage[] },
  now = new Date().toISOString(),
): string | null {
  const messages = input.messages
    .filter((message) => message.content.trim())
    .slice(-ASK_DATA_LIMITS.messagesPerConversation);
  if (!messages.length) return null;
  const conversation: AskConversation = {
    id: input.id,
    title: titleFromMessages(messages),
    titleEdited: false,
    createdAt: now,
    updatedAt: now,
    messages,
    draft: "",
    // トップの相談対象は /ask の人物一覧と別物なので持ち込まない。
    personIds: [],
  };
  const local = readLocalAskWorkspace(storage, now);
  const workspace: AskWorkspace = {
    version: 2,
    activeConversationId: conversation.id,
    conversations: [
      conversation,
      ...(local?.conversations ?? []).filter(
        (item) =>
          item.id !== conversation.id &&
          // 中身の無い既定の会話は残さない（30 件の枠を使わない）。
          (item.messages.length > 0 || item.draft.trim()),
      ),
    ].slice(0, ASK_DATA_LIMITS.conversations),
    people: local?.people ?? [],
    memories: local?.memories ?? [],
    updatedAt: now,
  };
  try {
    storage.setItem(ASK_DATA_STORAGE_KEY, JSON.stringify(workspace));
    return conversation.id;
  } catch {
    return null;
  }
}

/**
 * ログインから戻ったとき、読み込んだ相談（クラウドが新しければクラウド）に
 * 押したときの会話が無ければ、端末の写しから足して開く。
 */
export function withResumedConversation(
  chosen: AskWorkspace,
  local: AskWorkspace | null,
  resumeId: string | null,
): AskWorkspace {
  if (!resumeId) return chosen;
  if (chosen.conversations.some((item) => item.id === resumeId))
    return { ...chosen, activeConversationId: resumeId };
  const resumed = local?.conversations.find((item) => item.id === resumeId);
  if (!resumed) return chosen;
  return {
    ...chosen,
    activeConversationId: resumeId,
    conversations: [
      { ...resumed, personIds: [] },
      ...chosen.conversations,
    ].slice(0, ASK_DATA_LIMITS.conversations),
    updatedAt:
      resumed.updatedAt > chosen.updatedAt
        ? resumed.updatedAt
        : chosen.updatedAt,
  };
}

/** URL の resume を読む。形が合わなければ無視する。 */
export function readResumeParam(search: string): string | null {
  const value = new URLSearchParams(search).get("resume");
  return value && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}
