export function pageLabel(pathname: string): string {
  if (pathname === "/") return "Workspace";
  if (pathname === "/books" || pathname === "/books/") return "My Books";
  if (pathname === "/books/new") return "New Book";
  if (/^\/books\/[^/]+\/vision\/?$/.test(pathname)) return "Book Vision";
  if (/^\/books\/[^/]+\/manuscript\/?$/.test(pathname)) return "Manuscript";
  if (/^\/books\/[^/]+\/chat\/?$/.test(pathname)) return "Book Chat";
  if (pathname === "/settings") return "Settings";
  return "Story Platform";
}
