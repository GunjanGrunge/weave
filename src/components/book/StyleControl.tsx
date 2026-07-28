import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Palette, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  fetchStyleConfig,
  MAX_CUSTOM_INSTRUCTION_LENGTH,
  StyleConflictError,
  updateBookStyle,
  type BookStyleState,
  type Style,
  type StylePreset,
} from "@/lib/styles";

type SaveStatus = "Saved" | "Saving" | "Error";
type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      presets: StylePreset[];
      defaultPresetId: string;
    }
  | { status: "error" };

function sameStyle(left: Style, right: Style): boolean {
  return (
    left.presetIds.length === right.presetIds.length &&
    left.presetIds.every((id, index) => id === right.presetIds[index]) &&
    (left.customInstruction ?? "") === (right.customInstruction ?? "")
  );
}

function cloneStyle(style: Style): Style {
  return style.customInstruction
    ? { presetIds: [...style.presetIds], customInstruction: style.customInstruction }
    : { presetIds: [...style.presetIds] };
}

export function StyleControl({ bookId }: { bookId: string }) {
  const identityRef = useRef(bookId);
  const desiredRef = useRef<Style>({ presetIds: [] });
  const savedRef = useRef<BookStyleState>({ style: { presetIds: [] }, styleRevision: 0 });
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictRef = useRef<BookStyleState | null>(null);
  const loadRequestRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [style, setStyle] = useState<Style>({ presetIds: [] });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("Saved");
  const [conflict, setConflict] = useState<(BookStyleState & { message: string }) | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  function applyCanonical(state: BookStyleState) {
    const next = cloneStyle(state.style);
    desiredRef.current = next;
    savedRef.current = { style: cloneStyle(next), styleRevision: state.styleRevision };
    conflictRef.current = null;
    setStyle(next);
    setConflict(null);
    setSelectionError(null);
    setSaveStatus("Saved");
  }

  async function load(requestBookId: string) {
    const requestId = ++loadRequestRef.current;
    setLoadState({ status: "loading" });
    try {
      const response = await fetchStyleConfig(requestBookId);
      if (
        identityRef.current !== requestBookId ||
        loadRequestRef.current !== requestId ||
        !response.style ||
        typeof response.styleRevision !== "number"
      ) {
        return;
      }
      setLoadState({
        status: "ready",
        presets: response.presets,
        defaultPresetId: response.defaultPresetId,
      });
      applyCanonical({ style: response.style, styleRevision: response.styleRevision });
    } catch {
      if (identityRef.current === requestBookId && loadRequestRef.current === requestId) {
        setLoadState({ status: "error" });
      }
    }
  }

  useEffect(() => {
    identityRef.current = bookId;
    loadRequestRef.current += 1;
    setOpen(false);
    setConflict(null);
    conflictRef.current = null;
    savePromiseRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void load(bookId);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // load is deliberately route-keyed; late responses are rejected by identityRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  async function startSave(): Promise<boolean> {
    if (
      savePromiseRef.current ||
      conflictRef.current ||
      sameStyle(desiredRef.current, savedRef.current.style)
    ) {
      return savePromiseRef.current ?? !conflictRef.current;
    }
    const requestBookId = identityRef.current;
    const requestedStyle = cloneStyle(desiredRef.current);
    const expectedRevision = savedRef.current.styleRevision;
    setSaveStatus("Saving");
    const work = updateBookStyle(requestBookId, requestedStyle, expectedRevision)
      .then((saved) => {
        if (identityRef.current !== requestBookId) {
          return false;
        }
        savedRef.current = { style: cloneStyle(saved.style), styleRevision: saved.styleRevision };
        if (sameStyle(desiredRef.current, requestedStyle)) {
          const canonical = cloneStyle(saved.style);
          desiredRef.current = canonical;
          setStyle(canonical);
          setSaveStatus("Saved");
        } else {
          setSaveStatus("Saving");
        }
        return true;
      })
      .catch((error: unknown) => {
        if (identityRef.current !== requestBookId) {
          return false;
        }
        if (error instanceof StyleConflictError) {
          conflictRef.current = error.canonical;
          setConflict({ ...error.canonical, message: error.message });
        }
        setSaveStatus("Error");
        return false;
      })
      .finally(() => {
        if (savePromiseRef.current === work) {
          savePromiseRef.current = null;
        }
      });
    savePromiseRef.current = work;
    const succeeded = await work;
    if (
      succeeded &&
      !conflictRef.current &&
      identityRef.current === requestBookId &&
      !sameStyle(desiredRef.current, savedRef.current.style)
    ) {
      return startSave();
    }
    return succeeded;
  }

  useEffect(() => {
    if (loadState.status !== "ready" || conflict || sameStyle(style, savedRef.current.style)) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void startSave();
    }, 650);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // startSave reads current refs and should not restart the debounce on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, conflict, loadState.status]);

  function changeStyle(next: Style) {
    desiredRef.current = next;
    setStyle(next);
    setSelectionError(null);
    setSaveStatus("Saving");
  }

  function togglePreset(preset: StylePreset) {
    const { id } = preset;
    if (style.presetIds.includes(id)) {
      changeStyle({ ...style, presetIds: style.presetIds.filter((presetId) => presetId !== id) });
      return;
    }
    if (!preset.active) {
      return;
    }
    if (style.presetIds.length >= 2) {
      setSelectionError("Choose up to two presets.");
      return;
    }
    changeStyle({ ...style, presetIds: [...style.presetIds, id] });
  }

  function updateCustomInstruction(value: string) {
    changeStyle(
      value
        ? { presetIds: style.presetIds, customInstruction: value }
        : { presetIds: style.presetIds },
    );
  }

  function reloadCanonical() {
    if (conflictRef.current) {
      applyCanonical(conflictRef.current);
    }
  }

  function keepMine() {
    const canonical = conflictRef.current;
    if (!canonical) {
      return;
    }
    savedRef.current = {
      style: cloneStyle(canonical.style),
      styleRevision: canonical.styleRevision,
    };
    conflictRef.current = null;
    setConflict(null);
    setSaveStatus("Saving");
    void startSave();
  }

  const activeSummary =
    loadState.status === "ready"
      ? style.presetIds
          .map((id) => loadState.presets.find((preset) => preset.id === id)?.label)
          .filter((label): label is string => Boolean(label))
          .join(" + ") || (style.customInstruction ? "Custom" : "Default")
      : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Book Style">
          <Palette className="size-4" />
          Style
          {activeSummary && (
            <span className="hidden max-w-48 truncate sm:inline">: {activeSummary}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Book Style</SheetTitle>
          <SheetDescription>Choose up to two voices and add your own direction.</SheetDescription>
        </SheetHeader>

        {loadState.status === "loading" && (
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading style
          </p>
        )}

        {loadState.status === "error" && (
          <div className="mt-8 rounded-md border border-destructive/40 p-4">
            <p className="text-sm text-muted-foreground">Could not load this Book Style.</p>
            <Button
              className="mt-3"
              type="button"
              variant="outline"
              onClick={() => void load(bookId)}
            >
              <RotateCcw className="size-4" />
              Retry
            </Button>
          </div>
        )}

        {loadState.status === "ready" && (
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              {loadState.presets
                .filter((preset) => preset.active || style.presetIds.includes(preset.id))
                .map((preset) => {
                const selected = style.presetIds.includes(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePreset(preset)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {preset.label}
                      {!preset.active && " (Retired)"}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectionError && (
              <p role="alert" className="text-sm text-destructive">
                {selectionError}
              </p>
            )}

            <label className="block text-sm font-medium">
              Custom style instruction
              <textarea
                aria-label="Custom style instruction"
                value={style.customInstruction ?? ""}
                onChange={(event) => updateCustomInstruction(event.target.value)}
                maxLength={MAX_CUSTOM_INSTRUCTION_LENGTH}
                rows={5}
                className="mt-2 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-accent"
              />
              <span className="mt-1 block text-right font-mono text-[10px] font-normal text-muted-foreground">
                {(style.customInstruction?.length ?? 0).toLocaleString()} /{" "}
                {MAX_CUSTOM_INSTRUCTION_LENGTH.toLocaleString()}
              </span>
            </label>

            <p role="status" className="text-xs text-muted-foreground">
              {saveStatus === "Saving" && <Loader2 className="mr-1 inline size-3 animate-spin" />}
              {saveStatus === "Error" && <AlertCircle className="mr-1 inline size-3" />}
              {saveStatus}
            </p>

            {saveStatus === "Error" && !conflict && (
              <Button type="button" variant="outline" onClick={() => void startSave()}>
                <RotateCcw className="size-4" />
                Retry save
              </Button>
            )}

            {conflict && (
              <div className="rounded-md border border-destructive/40 p-4">
                <p className="text-sm text-muted-foreground">{conflict.message}</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" onClick={reloadCanonical}>
                    Reload
                  </Button>
                  <Button type="button" onClick={keepMine}>
                    Keep mine
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
