import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { createQueryClient } from "./app/query-client";
import { router } from "./app/router";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { AnnouncerProvider } from "./components/live-region";
import "./index.css";

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AnnouncerProvider>
          <RouterProvider router={router} />
        </AnnouncerProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
