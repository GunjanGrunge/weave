import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/books/new")({
  head: () => ({
    meta: [
      { title: "New Book · Story Platform" },
      {
        name: "description",
        content: "A conversational wizard to shape your next manuscript, one question at a time.",
      },
      { property: "og:title", content: "Begin a new book · Story Platform" },
      { property: "og:description", content: "Concept, cast, structure — a calm way to start." },
    ],
  }),
  component: NewBook,
});

const steps = [
  {
    id: "concept",
    title: "The seed",
    prompt:
      "In one sentence, what is this book about? Don't overthink it. Instinct now, precision later.",
  },
  {
    id: "tone",
    title: "Genre & tone",
    prompt: "Where does it live on the shelf, and what does it feel like at 2 a.m.?",
  },
  {
    id: "cast",
    title: "The cast",
    prompt: "Who walks onto the page first? Two or three names is plenty.",
  },
  { id: "structure", title: "Shape", prompt: "How long, how many acts, and where does it end?" },
  { id: "review", title: "Review", prompt: "Here is what we'll build the workspace around." },
];

export default function NewBook() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const current = steps[step];

  return (
    <div className="mx-auto max-w-3xl animate-reveal px-6 py-10 lg:px-10">
      <Link
        to="/books"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to shelf
      </Link>

      <div className="mt-6 flex items-center gap-3">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={`grid size-6 place-items-center rounded-full font-mono text-[10px] ${
                i < step
                  ? "bg-accent text-accent-foreground"
                  : i === step
                    ? "border border-accent text-accent"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="size-3" /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <div className="mt-10">
        <SectionLabel>
          Step {step + 1} of {steps.length} · {current.title}
        </SectionLabel>
        <h1 className="mt-3 font-display text-3xl italic leading-tight lg:text-4xl">
          {current.prompt}
        </h1>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          {step < 4 ? (
            <textarea
              value={answers[current.id] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [current.id]: e.target.value })}
              aria-label={current.title}
              className="min-h-[140px] w-full resize-none bg-transparent font-serif text-lg leading-relaxed outline-none"
            />
          ) : (
            <div className="space-y-4">
              {steps.slice(0, 4).map((s) => (
                <div key={s.id} className="border-l-2 border-accent/40 pl-4">
                  <SectionLabel>{s.title}</SectionLabel>
                  <p className="mt-1 font-serif text-sm text-foreground/90">
                    {answers[s.id] || (
                      <span className="italic text-muted-foreground">
                        Left blank — we'll ask later.
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              Continue <ArrowRight className="size-3" />
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/write" })}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              Open the studio <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
