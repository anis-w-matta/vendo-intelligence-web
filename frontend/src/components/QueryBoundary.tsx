import type { ReactNode } from "react";
import type { QueryState } from "../hooks/useApiQuery";
import { ErrorBanner, LoadingBlock } from "./states/States";

// Shared loading/error handling so every page's body is just "given the
// data, render it" - the fetch/loading/error boilerplate lives here once.
export function QueryBoundary<T>({
  state,
  onRetry,
  children,
}: {
  state: QueryState<T>;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <LoadingBlock />;
  if (state.status === "error") return <ErrorBanner error={state.error} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}
