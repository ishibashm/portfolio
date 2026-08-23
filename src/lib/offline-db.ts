// import Dexie, { Table } from 'dexie';
// import * as Y from 'yjs';
// import { WebsocketProvider } from 'y-websocket';

export interface ChatMessageEntity {
  id: string;
  workspaceId: string;
  content: string;
  isSynced: boolean; // オフライン時に作成された Outbox アイテムかどうか
  timestamp: number;
}

export interface WidgetEntity {
  id: string;
  workspaceId: string;
  type: string;
  data: any;
}

/* 
// 実際には以下のように Dexie を使って IndexedDB を構築する
export class OmniTerminalDB extends Dexie {
  chatOutbox!: Table<ChatMessageEntity, string>;
  cachedWidgets!: Table<WidgetEntity, string>;

  constructor() {
    super('OmniTerminalDB');
    this.version(1).stores({
      chatOutbox: 'id, workspaceId, isSynced, timestamp',
      cachedWidgets: 'id, workspaceId, type'
    });
  }
}
export const db = new OmniTerminalDB();
*/

/**
 * PWA の Service Worker との連携 (Background Sync API) を想定したダミー実装
 * オフライン環境でのチャット入力を IndexedDB に貯め、復旧時に送信する。
 */
export const saveToOutbox = async (workspaceId: string, message: string) => {
  console.log(
    `[Offline-First] Saving message to IndexedDB Outbox for Workspace ${workspaceId}: ${message}`,
  );
  // await db.chatOutbox.add({ id: uuid(), workspaceId, content: message, isSynced: false, timestamp: Date.now() });

  // ネットワーク復旧時に再送を試みるための Sync Tag を登録
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const swRegistration = await navigator.serviceWorker.ready;
      // @ts-expect-error -- SyncManager は lib.dom の ServiceWorkerRegistration に無い
      await swRegistration.sync.register("sync-chat-outbox");
      console.log("[Background Sync] Registered sync event.");
    } catch (e) {
      console.warn("Background sync not supported or failed.", e);
    }
  }
};

/**
 * CRDT (Conflict-free Replicated Data Type) を用いた
 * Yjs によるウィジェットの共有ワークスペース同期の実装例
 */
export const setupCollaborativeWorkspace = (
  workspaceId: string,
  roomName: string,
) => {
  // const ydoc = new Y.Doc();
  // const provider = new WebsocketProvider('wss://ws.omni-terminal.com', roomName, ydoc);
  // const yWidgets = ydoc.getArray('widgets');

  // yWidgets.observe((event) => {
  //   console.log('Widgets updated collaboratively: ', yWidgets.toArray());
  //   // ここで Zustand ストア (omniStore) に変更を同期する
  // });

  console.log(
    `[CRDT] Setup collaborative Yjs provider for workspace: ${workspaceId}, room: ${roomName}`,
  );

  return {
    // ydoc,
    // yWidgets,
    // provider
  };
};
