import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signOut, type AuthError } from "firebase/auth";
import { BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in - Story Platform" },
      { name: "description", content: "Sign in to your private Story workspace." },
    ],
  }),
  component: LoginRoute,
});

function friendlyAuthError(error: unknown): string {
  const code = (error as AuthError)?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found for that email.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

// Thrown when the credentials themselves were fine (Firebase Auth accepted
// them) but the backend verification step couldn't be completed or trusted
// — a network/infra hiccup or an unexpected response shape, not a bad
// password. Kept distinct from a real 401 so the UI doesn't blame the
// user's credentials for something else's failure.
class WhoamiVerificationError extends Error {}

async function verifySignedInUser(): Promise<void> {
  let response: Response;
  try {
    response = await authenticatedFetch("/whoami");
  } catch {
    throw new WhoamiVerificationError("Could not reach the server to verify your account.");
  }

  if (response.status === 401) {
    throw new Error("Unable to verify the signed-in account.");
  }

  // Defend against a misconfigured VITE_FIREBASE_FUNCTIONS_URL silently
  // hitting the SPA's catch-all rewrite (a 200 OK HTML page) instead of the
  // real whoami function — a bare `.ok` check would treat that as a pass.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const uid = (body as { uid?: unknown } | undefined)?.uid;
  if (!response.ok || typeof uid !== "string") {
    throw new WhoamiVerificationError("Could not verify the signed-in account.");
  }

  // Task 6: visible, unobtrusive proof the whole auth chain works end to end.
  console.log("Signed in as uid:", uid);
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await verifySignedInUser();
      onSuccess();
    } catch (err) {
      if (auth.currentUser) {
        await signOut(auth);
      }
      setError(
        err instanceof WhoamiVerificationError
          ? "Signed in, but couldn't verify your account. Please try again."
          : friendlyAuthError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-10 flex w-full max-w-sm flex-col gap-4"
      aria-label="Sign in"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoFocus
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="pointer-events-auto h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="pointer-events-auto h-11 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring"
        />
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm shadow-accent/20 transition-colors hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
      >
        <LockKeyhole className="size-4" />
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

function LoginRoute() {
  const navigate = useNavigate();

  return (
    <main className="isolate flex min-h-svh bg-background text-foreground">
      <section className="hidden min-h-svh w-[42%] shrink-0 flex-col justify-between border-r border-border bg-sidebar p-8 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-accent font-display text-xl italic text-accent-foreground">
            S
          </span>
          <span className="text-sm font-semibold tracking-tight">Story Platform</span>
        </div>

        <div className="max-w-md">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-accent" />
            Private workspace
          </div>
          <h1 className="font-display text-5xl italic leading-tight text-foreground">
            Your manuscript stays with your account.
          </h1>
          <p className="mt-4 max-w-sm font-serif text-base leading-7 text-muted-foreground">
            Sign in with the writer account created for this workspace.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["Draft", "Shape", "Publish"].map((label) => (
            <div key={label} className="rounded-md border border-border bg-background/45 px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-svh flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-md bg-accent font-display text-xl italic text-accent-foreground">
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">Story Platform</span>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                <BookOpenCheck className="size-5" />
              </div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Writer sign in
              </p>
              <h2 className="mt-2 font-display text-3xl italic leading-tight text-foreground">
                Open your workspace.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use one of the private email/password accounts provisioned in Firebase Auth.
              </p>
            </div>

            <LoginForm onSuccess={() => navigate({ to: "/" })} />
          </div>
        </div>
      </section>
    </main>
  );
}
