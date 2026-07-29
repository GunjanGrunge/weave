import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import type { Chapter } from "../types/chapter.js";
import type { Scene } from "../types/scene.js";
import { getBook } from "./books.js";

const MAX_ATOMIC_SNAPSHOT_WRITES = 450;
const MAX_EXPORT_CHAPTERS = 200;
const MAX_EXPORT_SCENES = 5_000;
const MAX_EXPORT_CHARACTERS = 10_000_000;

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

function chapterTitle(chapter: Chapter): string {
  return typeof chapter.title === "string" && chapter.title.trim()
    ? chapter.title.trim()
    : `Chapter ${chapter.order + 1}`;
}

export type SceneDiff = {
  sceneId: string;
  status: "unchanged" | "added" | "removed" | "changed";
};

export type ChapterDiff = {
  chapterId: string;
  title: string;
  status: "unchanged" | "added" | "removed" | "changed";
  scenes: SceneDiff[];
};

export type ManuscriptScene = {
  sceneId: string;
  order: number;
  text: string;
};

export type ManuscriptChapter = {
  chapterId: string;
  order: number;
  title: string;
  scenes: ManuscriptScene[];
};

export type BookManuscript = {
  bookId: string;
  title: string;
  chapters: ManuscriptChapter[];
  sceneCount: number;
  wordCount: number;
};

export class SnapshotError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
  }
}

async function verifyBookOwnership(bookId: string, uid: string): Promise<void> {
  const book = await getBook(bookId);
  if (!book) {
    throw new SnapshotError("not-found", "Book not found.");
  }
  if (book.uid !== uid) {
    throw new SnapshotError("permission-denied", "Permission denied.");
  }
}

export async function readBookManuscript(bookId: string, uid: string): Promise<BookManuscript> {
  await verifyBookOwnership(bookId, uid);

  const book = await getBook(bookId);
  if (!book) {
    throw new SnapshotError("not-found", "Book not found.");
  }

  const chaptersSnap = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .orderBy("order", "asc")
    .get();

  if (chaptersSnap.docs.length > MAX_EXPORT_CHAPTERS) {
    throw new SnapshotError("resource-exhausted", "This book has too many chapters to preview.");
  }

  const chapters: ManuscriptChapter[] = [];
  let sceneCount = 0;
  let characterCount = 0;
  let wordCount = 0;

  for (const chapterDoc of chaptersSnap.docs) {
    const chapter = chapterDoc.data() as Chapter;
    const scenesSnap = await chapterDoc.ref.collection("scenes").orderBy("order", "asc").get();
    sceneCount += scenesSnap.docs.length;
    if (sceneCount > MAX_EXPORT_SCENES) {
      throw new SnapshotError("resource-exhausted", "This book has too many scenes to preview.");
    }

    const scenes = scenesSnap.docs.map((sceneDoc) => {
      const scene = sceneDoc.data() as Scene;
      const text = typeof scene.text === "string" ? scene.text : "";
      characterCount += text.length;
      wordCount += text.trim() ? text.trim().split(/\s+/u).length : 0;
      return {
        sceneId: sceneDoc.id,
        order: typeof scene.order === "number" ? scene.order : 0,
        text,
      };
    });

    if (characterCount > MAX_EXPORT_CHARACTERS) {
      throw new SnapshotError("resource-exhausted", "This book is too large to preview.");
    }

    const order = typeof chapter.order === "number" ? chapter.order : chapters.length;
    chapters.push({
      chapterId: chapterDoc.id,
      order,
      title: chapterTitle({ ...chapter, order }),
      scenes,
    });
  }

  return {
    bookId,
    title: book.title || "Untitled Book",
    chapters,
    sceneCount,
    wordCount,
  };
}

export async function createBookSnapshot(
  bookId: string,
  name: string,
  uid: string,
): Promise<string> {
  await verifyBookOwnership(bookId, uid);

  const db = firestore();
  const snapshotRef = db.collection("books").doc(bookId).collection("snapshots").doc();
  const snapshotId = snapshotRef.id;
  const sourceBook = await getBook(bookId);
  const sourceRevision =
    typeof sourceBook?.manuscriptRevision === "number" ? sourceBook.manuscriptRevision : 0;
  const writes: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: FirebaseFirestore.DocumentData;
  }> = [];

  const visionRef = db.collection("books").doc(bookId).collection("vision").doc("main");
  const visionSnap = await visionRef.get();
  if (visionSnap.exists) {
    writes.push({
      ref: snapshotRef.collection("vision").doc("main"),
      data: visionSnap.data()!,
    });
  }

  const chaptersSnap = await db.collection("books").doc(bookId).collection("chapters").get();

  for (const chapterDoc of chaptersSnap.docs) {
    const chapterId = chapterDoc.id;
    const chapterData = chapterDoc.data();

    const snapChapRef = snapshotRef.collection("chapters").doc(chapterId);
    writes.push({ ref: snapChapRef, data: chapterData });

    const scenesSnap = await chapterDoc.ref.collection("scenes").get();
    for (const sceneDoc of scenesSnap.docs) {
      const sceneId = sceneDoc.id;
      const sceneData = sceneDoc.data();

      writes.push({
        ref: snapChapRef.collection("scenes").doc(sceneId),
        data: sceneData,
      });
    }
  }

  for (const collectionName of ["messages", "sessions"] as const) {
    const sourceDocs = await db.collection("books").doc(bookId).collection(collectionName).get();
    for (const sourceDoc of sourceDocs.docs) {
      writes.push({
        ref: snapshotRef.collection(collectionName).doc(sourceDoc.id),
        data: sourceDoc.data(),
      });
    }
  }

  if (writes.length + 1 > MAX_ATOMIC_SNAPSHOT_WRITES) {
    throw new SnapshotError(
      "resource-exhausted",
      "This manuscript is too large for an atomic snapshot.",
    );
  }

  const bookRef = db.collection("books").doc(bookId);
  await db.runTransaction(async (transaction) => {
    const currentBook = await transaction.get(bookRef);
    const currentRevision =
      typeof currentBook.data()?.manuscriptRevision === "number"
        ? (currentBook.data()?.manuscriptRevision as number)
        : 0;
    if (!currentBook.exists || currentRevision !== sourceRevision) {
      throw new SnapshotError(
        "aborted",
        "The manuscript changed while the snapshot was being prepared. Try again.",
      );
    }
    for (const write of writes) {
      transaction.set(write.ref, write.data);
    }
    transaction.set(snapshotRef, {
      name,
      state: "ready",
      sourceRevision,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return snapshotId;
}

export async function listBookSnapshots(
  bookId: string,
  uid: string,
): Promise<Array<{ id: string; name: string; createdAt: unknown }>> {
  await verifyBookOwnership(bookId, uid);

  const db = firestore();
  const snapshotsSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("snapshots")
    .orderBy("createdAt", "desc")
    .get();

  return snapshotsSnap.docs
    .filter((doc) => {
      const state = doc.data().state;
      return state === undefined || state === "ready";
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name as string,
        createdAt: data.createdAt,
      };
    });
}

export async function compareBookSnapshot(
  bookId: string,
  snapshotId: string,
  uid: string,
): Promise<ChapterDiff[]> {
  await verifyBookOwnership(bookId, uid);

  const db = firestore();
  const snapshotRef = db.collection("books").doc(bookId).collection("snapshots").doc(snapshotId);
  const snapDoc = await snapshotRef.get();
  if (!snapDoc.exists) {
    throw new SnapshotError("not-found", "Snapshot not found.");
  }
  if (snapDoc.data()?.state !== undefined && snapDoc.data()?.state !== "ready") {
    throw new SnapshotError("failed-precondition", "Snapshot is not ready.");
  }

  // Fetch live chapters and scenes
  const liveChaptersSnap = await db.collection("books").doc(bookId).collection("chapters").get();
  const liveChaptersMap = new Map<string, Chapter>();
  const liveScenesMap = new Map<string, Map<string, Scene>>();

  for (const doc of liveChaptersSnap.docs) {
    const chapterId = doc.id;
    liveChaptersMap.set(chapterId, doc.data() as Chapter);

    const scenesSnap = await doc.ref.collection("scenes").get();
    const sceneMap = new Map<string, Scene>();
    for (const scDoc of scenesSnap.docs) {
      sceneMap.set(scDoc.id, scDoc.data() as Scene);
    }
    liveScenesMap.set(chapterId, sceneMap);
  }

  // Fetch snapshot chapters and scenes
  const snapChaptersSnap = await snapshotRef.collection("chapters").get();
  const snapChaptersMap = new Map<string, Chapter>();
  const snapScenesMap = new Map<string, Map<string, Scene>>();

  for (const doc of snapChaptersSnap.docs) {
    const chapterId = doc.id;
    snapChaptersMap.set(chapterId, doc.data() as Chapter);

    const scenesSnap = await doc.ref.collection("scenes").get();
    const sceneMap = new Map<string, Scene>();
    for (const scDoc of scenesSnap.docs) {
      sceneMap.set(scDoc.id, scDoc.data() as Scene);
    }
    snapScenesMap.set(chapterId, sceneMap);
  }

  const allChapterIds = Array.from(new Set([...liveChaptersMap.keys(), ...snapChaptersMap.keys()]));
  const diffs: ChapterDiff[] = [];

  for (const chapterId of allChapterIds) {
    const liveChap = liveChaptersMap.get(chapterId);
    const snapChap = snapChaptersMap.get(chapterId);

    const liveScenes = liveScenesMap.get(chapterId) ?? new Map<string, Scene>();
    const snapScenes = snapScenesMap.get(chapterId) ?? new Map<string, Scene>();

    const allSceneIds = Array.from(new Set([...liveScenes.keys(), ...snapScenes.keys()]));
    const sceneDiffs: SceneDiff[] = [];

    for (const sceneId of allSceneIds) {
      const liveSc = liveScenes.get(sceneId);
      const snapSc = snapScenes.get(sceneId);

      if (liveSc && !snapSc) {
        sceneDiffs.push({ sceneId, status: "added" });
      } else if (!liveSc && snapSc) {
        sceneDiffs.push({ sceneId, status: "removed" });
      } else if (liveSc && snapSc) {
        const changed = liveSc.text !== snapSc.text || liveSc.order !== snapSc.order;
        sceneDiffs.push({ sceneId, status: changed ? "changed" : "unchanged" });
      }
    }

    // Sort scene diffs by order asc (prioritize live order, fallback to snap order)
    sceneDiffs.sort((a, b) => {
      const orderA = liveScenes.get(a.sceneId)?.order ?? snapScenes.get(a.sceneId)?.order ?? 0;
      const orderB = liveScenes.get(b.sceneId)?.order ?? snapScenes.get(b.sceneId)?.order ?? 0;
      return orderA - orderB;
    });

    if (liveChap && !snapChap) {
      diffs.push({
        chapterId,
        title: chapterTitle(liveChap),
        status: "added",
        scenes: sceneDiffs,
      });
    } else if (!liveChap && snapChap) {
      diffs.push({
        chapterId,
        title: chapterTitle(snapChap),
        status: "removed",
        scenes: sceneDiffs,
      });
    } else if (liveChap && snapChap) {
      const metadataChanged =
        liveChap.order !== snapChap.order ||
        chapterTitle(liveChap) !== chapterTitle(snapChap) ||
        liveChap.summary !== snapChap.summary;

      const hasChangedScenes = sceneDiffs.some((s) => s.status !== "unchanged");

      const status = metadataChanged || hasChangedScenes ? "changed" : "unchanged";

      diffs.push({
        chapterId,
        title: chapterTitle(liveChap),
        status,
        scenes: sceneDiffs,
      });
    }
  }

  // Sort chapter diffs by order asc
  diffs.sort((a, b) => {
    const orderA =
      liveChaptersMap.get(a.chapterId)?.order ?? snapChaptersMap.get(a.chapterId)?.order ?? 0;
    const orderB =
      liveChaptersMap.get(b.chapterId)?.order ?? snapChaptersMap.get(b.chapterId)?.order ?? 0;
    return orderA - orderB;
  });

  return diffs;
}

export async function restoreBookSnapshot(
  bookId: string,
  snapshotId: string,
  confirmed: boolean,
  uid: string,
): Promise<void> {
  if (!confirmed) {
    throw new SnapshotError(
      "invalid-argument",
      "This operation is destructive and requires confirmation.",
    );
  }

  await verifyBookOwnership(bookId, uid);

  const db = firestore();
  const snapshotRef = db.collection("books").doc(bookId).collection("snapshots").doc(snapshotId);
  const snapDoc = await snapshotRef.get();
  if (!snapDoc.exists) {
    throw new SnapshotError("not-found", "Snapshot not found.");
  }
  if (snapDoc.data()?.state !== undefined && snapDoc.data()?.state !== "ready") {
    throw new SnapshotError("failed-precondition", "Snapshot is not ready.");
  }

  const deletes: FirebaseFirestore.DocumentReference[] = [];
  const restores: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: FirebaseFirestore.DocumentData;
  }> = [];

  const liveChapters = await db.collection("books").doc(bookId).collection("chapters").get();
  for (const chap of liveChapters.docs) {
    const scenes = await chap.ref.collection("scenes").get();
    for (const sc of scenes.docs) {
      deletes.push(sc.ref);
    }
    deletes.push(chap.ref);
  }

  for (const collectionName of [
    "facts",
    "messages",
    "sessions",
    "generationRequests",
    "chapterRequests",
  ] as const) {
    const liveDocs = await db.collection("books").doc(bookId).collection(collectionName).get();
    deletes.push(...liveDocs.docs.map((doc) => doc.ref));
  }

  const visionRef = db.collection("books").doc(bookId).collection("vision").doc("main");
  const liveVision = await visionRef.get();
  if (liveVision.exists) {
    deletes.push(visionRef);
  }

  const snapVisionRef = snapshotRef.collection("vision").doc("main");
  const snapVisionSnap = await snapVisionRef.get();
  if (snapVisionSnap.exists) {
    restores.push({ ref: visionRef, data: snapVisionSnap.data()! });
  }

  const snapChapters = await snapshotRef.collection("chapters").get();
  for (const snapChap of snapChapters.docs) {
    const chapterId = snapChap.id;
    const chapterData = snapChap.data();

    const liveChapRef = db.collection("books").doc(bookId).collection("chapters").doc(chapterId);
    restores.push({
      ref: liveChapRef,
      data: { ...chapterData, restoredFromSnapshot: snapshotId },
    });

    const snapScenes = await snapChap.ref.collection("scenes").get();
    for (const snapSc of snapScenes.docs) {
      const sceneId = snapSc.id;
      const sceneData = snapSc.data();

      restores.push({
        ref: liveChapRef.collection("scenes").doc(sceneId),
        data: { ...sceneData, restoredFromSnapshot: snapshotId },
      });
    }
  }

  const bookRef = db.collection("books").doc(bookId);
  for (const collectionName of ["messages", "sessions"] as const) {
    const snapshotDocs = await snapshotRef.collection(collectionName).get();
    for (const snapshotDoc of snapshotDocs.docs) {
      restores.push({
        ref: bookRef.collection(collectionName).doc(snapshotDoc.id),
        data: snapshotDoc.data(),
      });
    }
  }

  const restorePaths = new Set(restores.map((restore) => restore.ref.path));
  const uniqueDeletes = deletes.filter((ref) => !restorePaths.has(ref.path));
  const operationCount = uniqueDeletes.length + restores.length + 1;
  if (operationCount > MAX_ATOMIC_SNAPSHOT_WRITES) {
    throw new SnapshotError(
      "resource-exhausted",
      "This restore is too large to complete atomically.",
    );
  }

  await db.runTransaction(async (transaction) => {
    const bookSnap = await transaction.get(bookRef);
    if (!bookSnap.exists) {
      throw new SnapshotError("not-found", "Book not found.");
    }
    const currentRev = (bookSnap.data()?.manuscriptRevision as number | undefined) ?? 0;
    for (const ref of uniqueDeletes) {
      transaction.delete(ref);
    }
    for (const restore of restores) {
      transaction.set(restore.ref, restore.data);
    }
    transaction.update(bookRef, {
      manuscriptRevision: currentRev + 1,
      restoredAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function exportBookManuscript(
  bookId: string,
  format: "markdown" | "plain-text",
  uid: string,
): Promise<string> {
  await verifyBookOwnership(bookId, uid);

  const book = await getBook(bookId);
  if (!book) {
    throw new SnapshotError("not-found", "Book not found.");
  }

  const db = firestore();

  // Fetch chapters in book order
  const chaptersSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .orderBy("order", "asc")
    .get();

  const lines: string[] = [];
  let sceneCount = 0;

  if (format === "markdown") {
    lines.push(`# ${book.title}`);
    lines.push("");
  } else {
    lines.push(book.title);
    lines.push("");
  }

  for (const chapDoc of chaptersSnap.docs) {
    if (chaptersSnap.size > MAX_EXPORT_CHAPTERS) {
      throw new SnapshotError("resource-exhausted", "This book has too many chapters to export.");
    }
    const chapData = chapDoc.data() as Chapter;
    const title = chapterTitle(chapData);
    if (format === "markdown") {
      lines.push(`## ${title}`);
      lines.push("");
    } else {
      lines.push(title);
      lines.push("");
    }

    const scenesSnap = await chapDoc.ref.collection("scenes").orderBy("order", "asc").get();
    sceneCount += scenesSnap.size;
    if (sceneCount > MAX_EXPORT_SCENES) {
      throw new SnapshotError("resource-exhausted", "This book has too many scenes to export.");
    }
    for (const scDoc of scenesSnap.docs) {
      const scData = scDoc.data() as Scene;
      lines.push(scData.text);
      lines.push("");
    }
  }

  const content = lines.join("\n");
  if (content.length > MAX_EXPORT_CHARACTERS) {
    throw new SnapshotError("resource-exhausted", "This book is too large to export.");
  }

  const bucket = getStorage().bucket();
  const ext = format === "markdown" ? "md" : "txt";
  const file = bucket.file(`exports/${bookId}-${Date.now()}.${ext}`);

  await file.save(content, {
    contentType: format === "markdown" ? "text/markdown" : "text/plain",
    metadata: {
      cacheControl: "private, no-store",
    },
  });

  const [downloadUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 15,
  });
  return downloadUrl;
}
