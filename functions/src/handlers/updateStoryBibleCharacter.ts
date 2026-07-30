import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import { StoryBibleError, updateStoryBibleCharacter } from "../services/storyBible.js";
import type { CharacterProfile, StoryBibleCharacterPatch } from "../types/storyBible.js";

const MAX_NAME = 160;
const MAX_SUMMARY = 2_000;
const MAX_ALIASES = 20;
const MAX_FIELDS = 30;
const MAX_FIELD_NAME = 80;
const MAX_FIELD_VALUE = 500;

class ValidationError extends Error {}

type UpdateSuccess = { character: CharacterProfile };
type UpdateError = { code: string; message: string };

export type UpdateStoryBibleCharacterResult =
  | { statusCode: 200; body: UpdateSuccess }
  | { statusCode: 400 | 401 | 404 | 409; body: UpdateError };

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("Request body is invalid.");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} exceeds the ${maxLength} character limit.`);
  }
  return trimmed;
}

function stringArray(value: unknown, field: string, limit = MAX_ALIASES): string[] {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array.`);
  if (value.length > limit) {
    throw new ValidationError(`${field} exceeds the ${limit} item limit.`);
  }
  return [
    ...new Set(
      value
        .map((entry) => stringValue(entry, field, MAX_FIELD_VALUE))
        .filter(Boolean),
    ),
  ];
}

function stringRecord(value: unknown, field: string): Record<string, string> {
  const input = record(value);
  const entries = Object.entries(input);
  if (entries.length > MAX_FIELDS) {
    throw new ValidationError(`${field} exceeds the ${MAX_FIELDS} field limit.`);
  }
  return Object.fromEntries(
    entries
      .map(([key, item]) => [
        stringValue(key, `${field} field name`, MAX_FIELD_NAME),
        stringValue(item, field, MAX_FIELD_VALUE),
      ])
      .filter(([key, item]) => key.length > 0 && item.length > 0),
  );
}

function parse(body: unknown): {
  bookId: string;
  characterId: string;
  expectedVersion: number;
  patch: StoryBibleCharacterPatch;
} {
  const root = record(body);
  const bookId = stringValue(root.bookId, "bookId", 200);
  const characterId = stringValue(root.characterId, "characterId", 200);
  if (!bookId || !characterId) {
    throw new ValidationError("bookId and characterId are required.");
  }
  if (
    typeof root.expectedVersion !== "number" ||
    !Number.isInteger(root.expectedVersion) ||
    root.expectedVersion < 1
  ) {
    throw new ValidationError("expectedVersion must be a positive integer.");
  }
  const character = record(root.character);
  const name = stringValue(character.name, "name", MAX_NAME);
  if (!name) throw new ValidationError("Character name is required.");
  if (typeof character.archived !== "boolean") {
    throw new ValidationError("archived must be a boolean.");
  }

  return {
    bookId,
    characterId,
    expectedVersion: root.expectedVersion,
    patch: {
      name,
      aliases: stringArray(character.aliases, "aliases"),
      summary: stringValue(character.summary, "summary", MAX_SUMMARY),
      stableTraits: stringRecord(character.stableTraits, "stableTraits"),
      currentState: stringRecord(character.currentState, "currentState"),
      lockedFields: stringArray(character.lockedFields, "lockedFields", MAX_FIELDS).filter(
        (field) =>
          field === "name" ||
          field === "summary" ||
          field.startsWith("stableTraits.") ||
          field.startsWith("currentState."),
      ),
      archived: character.archived,
    },
  };
}

export async function buildUpdateStoryBibleCharacterResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<UpdateStoryBibleCharacterResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const root = record(body);
    const bookId = stringValue(root.bookId, "bookId", 200);
    if (!bookId) throw new ValidationError("bookId is required.");

    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const parsed = parse(body);
    const character = await updateStoryBibleCharacter(
      parsed.bookId,
      parsed.characterId,
      parsed.expectedVersion,
      parsed.patch,
    );
    return { statusCode: 200, body: { character } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: error.message },
      };
    }
    if (error instanceof StoryBibleError) {
      return {
        statusCode: error.code === "version-conflict" ? 409 : 404,
        body: { code: error.code, message: error.message },
      };
    }
    if (
      error instanceof Error &&
      (error as Error & { code?: string }).code === "version-conflict"
    ) {
      return {
        statusCode: 409,
        body: { code: "version-conflict", message: error.message },
      };
    }
    throw error;
  }
}

export const updateStoryBibleCharacterEndpoint = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildUpdateStoryBibleCharacterResponse(
        request.headers.authorization,
        request.body,
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);
