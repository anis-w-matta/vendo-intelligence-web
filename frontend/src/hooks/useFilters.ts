import { useSearchParams } from "react-router-dom";
import { filtersToSearchParams, searchParamsToFilters } from "../lib/filters";
import type { Filters } from "../lib/types";

// Filters live in the URL (shareable/bookmarkable, survives refresh) rather
// than component state - the global filter bar and every page read/write
// the same source of truth.
export function useFilters(): [Filters, (next: Filters) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = searchParamsToFilters(searchParams);

  function setFilters(next: Filters) {
    setSearchParams(filtersToSearchParams(next));
  }

  return [filters, setFilters];
}
