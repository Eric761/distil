import { NavLink, Outlet } from "react-router-dom";
import { FileStack, ListChecks, Search } from "lucide-react";
import { DistilMark } from "@/components/brand";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/documents", label: "Documents", Icon: FileStack },
  { to: "/review-queue", label: "Review queue", Icon: ListChecks },
  { to: "/query", label: "Query", Icon: Search },
];

export function AppLayout() {
  return (
    <div className="min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6">
          <NavLink
            to="/documents"
            className="group flex shrink-0 items-center gap-2.5 rounded-lg outline-offset-4 transition-opacity hover:opacity-90"
            aria-label="Distil — Structure from Chaos"
          >
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-white/15 transition-shadow group-hover:shadow-md">
              <DistilMark className="size-[18px]" />
            </div>
            <span className="inline-flex items-center">
              <span className="text-lg font-semibold leading-none tracking-tight text-foreground">Distil</span>
              <span
                className="hidden items-center pl-1 text-[13px] font-light leading-none text-muted-foreground/75 xl:inline-flex"
                aria-hidden="true"
              >
                <span className="pr-1 text-sm font-semibold leading-none text-muted-foreground/40">·</span>
                <span>Structure from Chaos</span>
              </span>
            </span>
          </NavLink>

          <div className="hidden h-6 w-px shrink-0 bg-border/80 sm:block" aria-hidden="true" />

          <nav className="flex min-w-0 items-center gap-1" aria-label="Primary">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </div>
  );
}
