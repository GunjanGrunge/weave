import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/books")({
  component: BooksLayout,
});

function BooksLayout() {
  return <Outlet />;
}
