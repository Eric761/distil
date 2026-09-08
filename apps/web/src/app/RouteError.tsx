import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6 text-center">
      <div className="max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold">This page hit an error</h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">{message}</p>
        <p className="mt-1 text-sm text-muted-foreground">Your data is safe.</p>
        <Button asChild className="mt-4">
          <Link to="/documents">Back to documents</Link>
        </Button>
      </div>
    </div>
  );
}
