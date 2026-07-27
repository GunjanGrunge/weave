import { useQuery } from "@tanstack/react-query";

import { authenticatedFetch } from "./api";
import { useAuth } from "./auth-context";

export type BookSummary = {
  bookId: string;
  title: string;
  style: {
    presetIds: string[];
    customInstruction?: string;
  };
  createdAt: string | null;
};

function isBookSummary(value: unknown): value is BookSummary {
  if (typeof value !== "object" || value === null) return false;
  const book = value as Partial<BookSummary>;
  return (
    typeof book.bookId === "string" &&
    typeof book.title === "string" &&
    (book.createdAt === null || typeof book.createdAt === "string") &&
    typeof book.style === "object" &&
    book.style !== null &&
    Array.isArray(book.style.presetIds) &&
    book.style.presetIds.every((id) => typeof id === "string")
  );
}

export async function fetchBooks(): Promise<BookSummary[]> {
  const response = await authenticatedFetch("/listBooks");
  if (!response.ok) {
    throw new Error("Could not load your books.");
  }

  const body = (await response.json()) as { books?: unknown };
  if (!Array.isArray(body.books) || !body.books.every(isBookSummary)) {
    throw new Error("The books response was invalid.");
  }
  return body.books;
}

export function booksQueryKey(uid: string | undefined) {
  return ["books", uid] as const;
}

export function useBooks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: booksQueryKey(user?.uid),
    queryFn: fetchBooks,
    enabled: Boolean(user),
    staleTime: 30_000,
  });
}

export function formatBookDate(createdAt: string | null): string {
  if (!createdAt) return "Recently created";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Recently created";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
