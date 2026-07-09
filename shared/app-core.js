// Narrow, shared helpers used only by sync-engine.js. Deliberately does NOT
// include calculateProgress() — mobile and desktop implement genuinely
// different progress algorithms and unifying them would change on-screen
// percentages as an unwanted side effect of sync work.

export function normalizeTask(task) {
  return {
    ...task,
    notes: task.notes || "",
    responsible: task.responsible || "",
    textColor: task.textColor || "text-slate-800",
    actualStartTime: task.actualStartTime || null,
    actualEndTime: task.actualEndTime || null,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [],
  };
}

export function normalizeSubtask(subtask) {
  return {
    ...subtask,
    checked: !!subtask.checked,
  };
}

function updatedAtMillis(task) {
  const val = task && task.updatedAt;
  if (!val) return -Infinity;
  if (typeof val.toMillis === "function") return val.toMillis();
  if (typeof val === "number") return val;
  const parsed = Date.parse(val);
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

// Returns whichever of localTask/remoteTask should win, by updatedAt.
// A task with no updatedAt yet always loses to one that has it; ties
// (including "neither has one") favor the remote copy, since remote is the
// server-confirmed source of truth once a doc exists there.
export function mergeTaskLastWriteWins(localTask, remoteTask) {
  if (!remoteTask) return localTask;
  if (!localTask) return remoteTask;
  return updatedAtMillis(localTask) > updatedAtMillis(remoteTask) ? localTask : remoteTask;
}
