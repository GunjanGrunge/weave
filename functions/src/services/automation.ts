import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

function taskRef(bookId: string, taskId: string) {
  return firestore().collection("books").doc(bookId).collection("automation").doc(taskId);
}

export async function claimAutomationTask(bookId: string, taskId: string): Promise<boolean> {
  const ref = taskRef(bookId, taskId);
  return firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      return false;
    }
    transaction.create(ref, {
      state: "processing",
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export async function completeAutomationTask(bookId: string, taskId: string): Promise<void> {
  await taskRef(bookId, taskId).set(
    {
      state: "completed",
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function failAutomationTask(
  bookId: string,
  taskId: string,
  reason: string,
): Promise<void> {
  await taskRef(bookId, taskId).set(
    {
      state: "failed",
      failureReason: reason.slice(0, 500),
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
