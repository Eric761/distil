import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One consistent page-header pattern across the app: an optional leading icon,
 * a title, an optional description, and a right-aligned actions slot. Using a
 * single component keeps spacing, type scale, and alignment identical on every
 * page (Documents, Review queue, Query, …).
 */
type PageHeaderProps = Readonly<{
  title: React.ReactNode;
  description?: React.ReactNode;
  descriptionClassName?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}>;

export function PageHeader({
  title,
  description,
  descriptionClassName,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          {icon ? (
            <span className="text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="break-words">{title}</span>
        </h1>
        {description ? (
          <p className={cn("mt-1 text-sm text-muted-foreground", descriptionClassName ?? "max-w-prose")}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
    </header>
  );
}
