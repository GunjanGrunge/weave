import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ChatPage } from "@/routes/books.$bookId.chat";
import { ManuscriptPage } from "@/routes/books.$bookId.manuscript";
import { manuscriptQueryKey } from "@/lib/manuscript";

export function WriteWorkspace({
  bookId,
  initialManuscriptOpen = false,
}: {
  bookId: string;
  initialManuscriptOpen?: boolean;
}) {
  const [manuscriptOpen, setManuscriptOpen] = useState(initialManuscriptOpen);
  const queryClient = useQueryClient();

  return (
    <div className="relative h-full">
      <ChatPage
        bookId={bookId}
        manuscriptOpen={manuscriptOpen}
        onToggleManuscript={() => setManuscriptOpen((current) => !current)}
        onSceneAccepted={() => {
          void queryClient.invalidateQueries({ queryKey: manuscriptQueryKey(bookId) });
        }}
      />
      {manuscriptOpen && (
        <div
          className="fixed inset-0 z-30 flex justify-end bg-background/60 backdrop-blur-sm"
          onClick={() => setManuscriptOpen(false)}
        >
          <div
            className="h-full w-full max-w-3xl overflow-y-auto bg-background shadow-2xl sm:border-l sm:border-border"
            onClick={(event) => event.stopPropagation()}
          >
            <ManuscriptPage bookId={bookId} embedded onClose={() => setManuscriptOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
