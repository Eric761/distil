import * as React from "react";
import { Search } from "lucide-react";
import type { ProcessingStatus, ReviewStatus } from "@invoice/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProcessingStatusIcon, ReviewStatusIcon } from "@/components/status-indicators";

export interface ToolbarValue {
  search: string;
  reviewStatus: ReviewStatus | "all";
  processingStatus: ProcessingStatus | "all";
  sort: "updatedAt" | "createdAt" | "vendorName" | "total";
}

type DocumentsToolbarProps = Readonly<{
  value: ToolbarValue;
  onChange: (next: Partial<ToolbarValue>) => void;
  onReset: () => void;
}>;

export function DocumentsToolbar({
  value,
  onChange,
  onReset,
}: DocumentsToolbarProps) {
  const [search, setSearch] = React.useState(value.search);

  // Debounce free-text search so we don't refetch on every keystroke.
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (search !== value.search) onChange({ search });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  React.useEffect(() => {
    setSearch(value.search);
  }, [value.search]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[12rem]">
        <label htmlFor="doc-search" className="mb-1 block text-xs font-medium text-muted-foreground">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="doc-search"
            value={search}
            placeholder="Filename or vendor"
            className="pl-8"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="review-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
          Review status
        </label>
        <Select
          value={value.reviewStatus}
          onValueChange={(v) => onChange({ reviewStatus: v as ToolbarValue["reviewStatus"] })}
        >
          <SelectTrigger id="review-filter" aria-label="Review status" className="w-[11rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="needs_review">
              <ReviewStatusIcon status="needs_review" /> Needs review
            </SelectItem>
            <SelectItem value="ready">
              <ReviewStatusIcon status="ready" /> Ready
            </SelectItem>
            <SelectItem value="approved">
              <ReviewStatusIcon status="approved" /> Approved
            </SelectItem>
            <SelectItem value="reopened">
              <ReviewStatusIcon status="reopened" /> Reopened
            </SelectItem>
            <SelectItem value="not_ready">
              <ReviewStatusIcon status="not_ready" /> Not ready
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor="processing-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
          Extraction status
        </label>
        <Select
          value={value.processingStatus}
          onValueChange={(v) => onChange({ processingStatus: v as ToolbarValue["processingStatus"] })}
        >
          <SelectTrigger id="processing-filter" aria-label="Extraction status" className="w-[11rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="processing">
              <ProcessingStatusIcon status="processing" /> Processing
            </SelectItem>
            <SelectItem value="succeeded">
              <ProcessingStatusIcon status="succeeded" /> Extracted
            </SelectItem>
            <SelectItem value="partial">
              <ProcessingStatusIcon status="partial" /> Partial
            </SelectItem>
            <SelectItem value="failed">
              <ProcessingStatusIcon status="failed" /> Failed
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor="sort-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
          Sort by
        </label>
        <Select value={value.sort} onValueChange={(v) => onChange({ sort: v as ToolbarValue["sort"] })}>
          <SelectTrigger id="sort-filter" aria-label="Sort by" className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">Recently updated</SelectItem>
            <SelectItem value="createdAt">Recently added</SelectItem>
            <SelectItem value="vendorName">Vendor</SelectItem>
            <SelectItem value="total">Total</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
