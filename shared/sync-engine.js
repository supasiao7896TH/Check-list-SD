import { getFirebaseApp, SDK_BASE } from "./firebase-config.js";
import { mergeTaskLastWriteWins } from "./app-core.js";

const READY_TIMEOUT_MS = 4000;

function stripMeta(task) {
  const { updatedAt, lastEditedBy, ...rest } = task;
  return rest;
}

// createSyncEngine wires a Firestore `tasks` collection to the caller's task
// array. It never assumes the caller's `App` object is reachable directly —
// all communication happens through the getLocalTasks/onRemoteChange/
// getIdentity callbacks, so both the mobile (same-module-scope) and desktop
// (window bridge) HTML files can use it identically.
export function createSyncEngine({ getLocalTasks, onRemoteChange, getIdentity, collectionName = "tasks" }) {
  let ready = false;
  let db = null;
  let fs = null;
  const remoteCache = new Map(); // taskId -> last known raw remote task data
  const lastPushed = new Map(); // taskId -> stripped-JSON of last known-synced content

  function markReady() {
    ready = true;
  }
  setTimeout(markReady, READY_TIMEOUT_MS);

  function applySnapshotDocs(docs, localById) {
    docs.forEach((doc) => {
      const id = doc.id;
      const remoteTask = { id, ...doc.data() };
      remoteCache.set(id, remoteTask);
      const winner = mergeTaskLastWriteWins(localById.get(id), remoteTask);
      localById.set(id, winner);
      if (winner === remoteTask) {
        lastPushed.set(id, JSON.stringify(stripMeta(remoteTask)));
      }
    });
  }

  async function init() {
    try {
      const app = await getFirebaseApp();
      fs = await import(`${SDK_BASE}/firebase-firestore.js`);
      db = fs.getFirestore(app);
      try {
        await fs.enableIndexedDbPersistence(db);
      } catch (err) {
        console.warn("[sync-engine] offline persistence unavailable:", err && err.code);
      }

      const colRef = fs.collection(db, collectionName);
      let firstSnapshot = true;

      fs.onSnapshot(
        colRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (firstSnapshot) {
            firstSnapshot = false;
            const localById = new Map(getLocalTasks().map((t) => [t.id, t]));
            applySnapshotDocs(snapshot.docs, localById);
            markReady();
            onRemoteChange(Array.from(localById.values()));
            return;
          }

          let changed = false;
          const localById = new Map(getLocalTasks().map((t) => [t.id, t]));
          for (const change of snapshot.docChanges()) {
            if (change.doc.metadata.hasPendingWrites) continue;
            const id = change.doc.id;
            if (change.type === "removed") {
              remoteCache.delete(id);
              lastPushed.delete(id);
              if (localById.has(id)) {
                localById.delete(id);
                changed = true;
              }
              continue;
            }
            applySnapshotDocs([change.doc], localById);
            changed = true;
          }
          if (changed) {
            onRemoteChange(Array.from(localById.values()));
          }
        },
        (err) => {
          console.warn("[sync-engine] onSnapshot error, staying local-only:", err);
          markReady();
        }
      );
    } catch (err) {
      console.warn("[sync-engine] Firestore unavailable, staying local-only:", err);
      markReady();
    }
  }

  init();

  // Diffs `tasks` against the last-known-synced content and writes only
  // what changed. Fire-and-forget: Firestore's offline persistence queues
  // writes automatically while offline and flushes them on reconnect.
  function push(tasks) {
    if (!ready || !db || !fs) return;

    const currentIds = new Set();
    const batch = fs.writeBatch(db);
    let hasWrites = false;

    for (const task of tasks) {
      currentIds.add(task.id);
      const serialized = JSON.stringify(stripMeta(task));
      if (lastPushed.get(task.id) === serialized) continue;

      const docData = { ...task, updatedAt: fs.serverTimestamp(), lastEditedBy: getIdentity() };
      delete docData.id;
      batch.set(fs.doc(db, collectionName, task.id), docData, { merge: true });
      lastPushed.set(task.id, serialized);
      hasWrites = true;
    }

    for (const id of Array.from(lastPushed.keys())) {
      if (currentIds.has(id)) continue;
      batch.delete(fs.doc(db, collectionName, id));
      lastPushed.delete(id);
      remoteCache.delete(id);
      hasWrites = true;
    }

    if (hasWrites) {
      batch.commit().catch((err) => console.warn("[sync-engine] push failed:", err));
    }
  }

  return { push };
}
