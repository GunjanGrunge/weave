export const BOOK_DELETED_NOTICE_KEY = "weave.bookDeletedNotice";
export const BOOK_DELETED_NOTICE =
  "The book and all associated data were permanently deleted from WEAVE.";

export function storeBookDeletedNotice(): void {
  try {
    sessionStorage.setItem(BOOK_DELETED_NOTICE_KEY, BOOK_DELETED_NOTICE);
  } catch {
    // Deletion must still complete when browser storage is unavailable.
  }
}

export function consumeBookDeletedNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(BOOK_DELETED_NOTICE_KEY);
    if (notice) sessionStorage.removeItem(BOOK_DELETED_NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

export function clearBookDeletedNotice(): void {
  try {
    sessionStorage.removeItem(BOOK_DELETED_NOTICE_KEY);
  } catch {
    // The in-page notification does not depend on browser storage.
  }
}
