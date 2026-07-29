import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import type { Chapter } from "../types/chapter.js";
import type { Scene } from "../types/scene.js";
import { getBook } from "./books.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
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

export async function createBookSnapshot(
  bookId: string,
  name: string,
  uid: string,
): Promise<string> {
  await verifyBookOwnership(bookId, uid);

  const db = firestore();
  const snapshotRef = db.collection("books").doc(bookId).collection("snapshots").doc();
  const snapshotId = snapshotRef.id;

  // 1. Write snapshot metadata
  await snapshotRef.set({
    name,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2. Copy Vision document
  const visionRef = db.collection("books").doc(bookId).collection("vision").doc("main");
  const visionSnap = await visionRef.get();
  if (visionSnap.exists) {
    await snapshotRef.collection("vision").doc("main").set(visionSnap.data()!);
  }

  // 3. Copy Chapters and Scenes
  const chaptersSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .get();

  for (const chapterDoc of chaptersSnap.docs) {
    const chapterId = chapterDoc.id;
    const chapterData = chapterDoc.data();

    const snapChapRef = snapshotRef.collection("chapters").doc(chapterId);
    await snapChapRef.set(chapterData);

    const scenesSnap = await chapterDoc.ref.collection("scenes").get();
    for (const sceneDoc of scenesSnap.docs) {
      const sceneId = sceneDoc.id;
      const sceneData = sceneDoc.data();

      await snapChapRef.collection("scenes").doc(sceneId).set(sceneData);
    }
  }

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

  return snapshotsSnap.docs.map((doc) => {
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

  const allChapterIds = Array.from(
    new Set([...liveChaptersMap.keys(), ...snapChaptersMap.keys()]),
  );
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
        title: `Chapter ${liveChap.order + 1}`,
        status: "added",
        scenes: sceneDiffs,
      });
    } else if (!liveChap && snapChap) {
      diffs.push({
        chapterId,
        title: `Chapter ${snapChap.order + 1}`,
        status: "removed",
        scenes: sceneDiffs,
      });
    } else if (liveChap && snapChap) {
      const metadataChanged =
        liveChap.order !== snapChap.order ||
        liveChap.summary !== snapChap.summary;

      const hasChangedScenes = sceneDiffs.some((s) => s.status !== "unchanged");

      const status = metadataChanged || hasChangedScenes ? "changed" : "unchanged";

      diffs.push({
        chapterId,
        title: `Chapter ${liveChap.order + 1}`,
        status,
        scenes: sceneDiffs,
      });
    }
  }

  // Sort chapter diffs by order asc
  diffs.sort((a, b) => {
    const orderA = liveChaptersMap.get(a.chapterId)?.order ?? snapChaptersMap.get(a.chapterId)?.order ?? 0;
    const orderB = liveChaptersMap.get(b.chapterId)?.order ?? snapChaptersMap.get(b.chapterId)?.order ?? 0;
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

  // 1. Purge all live chapters and scenes
  const liveChapters = await db.collection("books").doc(bookId).collection("chapters").get();
  for (const chap of liveChapters.docs) {
    const scenes = await chap.ref.collection("scenes").get();
    for (const sc of scenes.docs) {
      await sc.ref.delete();
    }
    await chap.ref.delete();
  }

  // 2. Purge facts
  const liveFacts = await db.collection("books").doc(bookId).collection("facts").get();
  for (const fact of liveFacts.docs) {
    await fact.ref.delete();
  }

  // 3. Delete live Vision Document
  const visionRef = db.collection("books").doc(bookId).collection("vision").doc("main");
  await visionRef.delete();

  // 4. Restore Vision Document from Snapshot
  const snapVisionRef = snapshotRef.collection("vision").doc("main");
  const snapVisionSnap = await snapVisionRef.get();
  if (snapVisionSnap.exists) {
    await visionRef.set(snapVisionSnap.data()!);
  }

  // 5. Restore Chapters and Scenes from Snapshot
  const snapChapters = await snapshotRef.collection("chapters").get();
  for (const snapChap of snapChapters.docs) {
    const chapterId = snapChap.id;
    const chapterData = snapChap.data();

    const liveChapRef = db.collection("books").doc(bookId).collection("chapters").doc(chapterId);
    await liveChapRef.set(chapterData);

    const snapScenes = await snapChap.ref.collection("scenes").get();
    for (const snapSc of snapScenes.docs) {
      const sceneId = snapSc.id;
      const sceneData = snapSc.data();

      await liveChapRef.collection("scenes").doc(sceneId).set(sceneData);
    }
  }

  // 6. Increment manuscriptRevision of the book
  const bookRef = db.collection("books").doc(bookId);
  await db.runTransaction(async (transaction) => {
    const bookSnap = await transaction.get(bookRef);
    if (bookSnap.exists) {
      const currentRev = (bookSnap.data()?.manuscriptRevision as number | undefined) ?? 0;
      transaction.update(bookRef, { manuscriptRevision: currentRev + 1 });
    }
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

  if (format === "markdown") {
    lines.push(`# ${book.title}`);
    lines.push("");
  } else {
    lines.push(book.title);
    lines.push("");
  }

  for (const chapDoc of chaptersSnap.docs) {
    const chapData = chapDoc.data() as Chapter;
    const title = `Chapter ${chapData.order + 1}`;
    if (format === "markdown") {
      lines.push(`## ${title}`);
      lines.push("");
    } else {
      lines.push(title);
      lines.push("");
    }

    const scenesSnap = await chapDoc.ref.collection("scenes").orderBy("order", "asc").get();
    for (const scDoc of scenesSnap.docs) {
      const scData = scDoc.data() as Scene;
      lines.push(scData.text);
      lines.push("");
    }
  }

  const content = lines.join("\n");

  const bucket = getStorage().bucket();
  const ext = format === "markdown" ? "md" : "txt";
  const file = bucket.file(`exports/${bookId}-${Date.now()}.${ext}`);

  await file.save(content, {
    contentType: format === "markdown" ? "text/markdown" : "text/plain",
  });

  let downloadUrl = "";
  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24, // 24 hours
    });
    downloadUrl = url;
  } catch (err) {
    console.warn("Could not generate signed URL, falling back to public URL:", err);
    downloadUrl = file.publicUrl();
  }

  return downloadUrl;
}
