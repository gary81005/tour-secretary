import { isSnapshotCurrent, type OfflineSnapshot } from './snapshot';

// 離線快照存在瀏覽器的 IndexedDB（ADR 0010 Q11），一趟行程一筆，key 是 tripId。
// 只能在瀏覽器裡呼叫（useEffect 或事件處理）。瀏覽器不支援或寫入失敗時會 reject，
// 呼叫端要略過錯誤，不能影響線上使用。
// 每次操作都開一次連線、做完就關，登出時 deleteDatabase 才不會被開著的連線擋住。

const DB_NAME = 'tour-secretary';
const DB_VERSION = 1;
const STORE = 'trip-snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'tripId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 在一個 transaction 裡操作，transaction 完成（全部寫入）後才 resolve。
// run 裡要用 request 的 onsuccess 接續操作，不能 await，否則 transaction 會提早結束。
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      run(transaction.objectStore(STORE), (value) => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}

// 存一趟行程的快照。已經存了更新的資料時（例如另一個分頁比較晚讀取）不覆蓋。
export function saveOfflineSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  return withStore<void>('readwrite', (store) => {
    const existing = store.get(snapshot.tripId);
    existing.onsuccess = () => {
      const current = existing.result as Partial<OfflineSnapshot> | undefined;
      if (current?.fetchedAt && current.fetchedAt > snapshot.fetchedAt) return;
      store.put(snapshot);
    };
  });
}

// 讀出還能用的快照，依出發日排序；過期或格式不符的順便刪掉（離線時行程結束隔天就不顯示）。
export function readOfflineSnapshots(now: Date): Promise<OfflineSnapshot[]> {
  return withStore<OfflineSnapshot[]>('readwrite', (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const current: OfflineSnapshot[] = [];
      for (const snapshot of request.result as unknown[]) {
        if (isSnapshotCurrent(snapshot, now)) {
          current.push(snapshot);
        } else if (typeof snapshot === 'object' && snapshot !== null && 'tripId' in snapshot) {
          store.delete(snapshot.tripId as IDBValidKey);
        }
      }
      done(current.toSorted((a, b) => a.trip.start_date.localeCompare(b.trip.start_date)));
    };
  });
}

// 只留下 tripIds 裡的行程：線上打開首頁時，把已結束、進垃圾桶、不再是成員的行程快照刪掉。
export function pruneOfflineSnapshots(tripIds: readonly string[]): Promise<void> {
  const keep = new Set(tripIds);
  return withStore<void>('readwrite', (store) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result) {
        if (typeof key !== 'string' || !keep.has(key)) store.delete(key);
      }
    };
  });
}

// 刪除全部快照（登出）。整個資料庫刪掉，之後打開時會重新建立。
export function deleteOfflineSnapshots(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
