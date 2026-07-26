import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

function initialsFor(email: string | null): string {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  async function handleSignOut() {
    await signOut(auth);
    // RouteGuard reacts to the resulting null-user auth state and redirects to /login.
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 font-mono text-[10px] font-bold text-accent",
        )}
        title={user.email ?? undefined}
      >
        {initialsFor(user.email)}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        aria-label="Sign out"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
