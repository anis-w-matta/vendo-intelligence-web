import { useEffect, useRef, useState } from "react";
import { ApiError, UnauthorizedError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export type QueryState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T };

// Re-fetches whenever `deps` changes (typically [JSON.stringify(filters)]).
// A generic hook rather than one per page - every page's data need is
// "call this async function, track loading/error/success" and nothing more.
export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ status: "loading" });
  const { signOut } = useAuth();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetcherRef.current()
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          signOut();
          return;
        }
        const apiErr = err instanceof ApiError ? err : new ApiError(0, "Unexpected error.");
        setState({ status: "error", error: apiErr });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
