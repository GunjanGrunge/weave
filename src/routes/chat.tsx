import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send } from "lucide-react";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "AI Chat · Story Platform" },
      { name: "description", content: "A private conversation about your book with a context-aware co-author." },
      { property: "og:title", content: "AI Chat · Story Platform" },
      { property: "og:description", content: "Talk to a co-author who has read every page." },
    ],
  }),
  component: ChatPage,
});

const seed = [
  { from: "you", text: "The middle of the book feels slow. Where does it drag most?" },
  { from: "ai", text: "Between Chapters 7 and 9. You spend three scenes on Elias reading correspondence when one would suffice — and the letters do the same emotional work Isolde's harbor scene already does in Chapter 4. Two options: cut Chapter 8's letter scene entirely, or reframe it as a memory Elias interrupts himself telling." },
  { from: "you", text: "Would cutting Chapter 8 break anything?" },
  { from: "ai", text: "One thread only: Vale's motive setup relies on his casual line about the archive. Move that line to Chapter 9's opening — three sentences — and the cut becomes seamless." },
];

function ChatPage() {
  const [msg, setMsg] = useState("");
  return (
    <div className="mx-auto flex h-full max-w-3xl animate-reveal flex-col px-6 py-8 lg:px-10">
      <SectionLabel>Co-author</SectionLabel>
      <h1 className="mt-2 font-display text-4xl italic">AI Chat</h1>

      <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-2">
        {seed.map((m, i) =>
          m.from === "you" ? (
            <div key={i} className="ml-auto max-w-[80%] rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              {m.text}
            </div>
          ) : (
            <div key={i} className="max-w-[85%]">
              <SectionLabel>Story assistant</SectionLabel>
              <p className="mt-2 font-serif text-base leading-relaxed">{m.text}</p>
            </div>
          ),
        )}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4 focus-within:border-accent/40">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Ask about pacing, character, plot, style..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}