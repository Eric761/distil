import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  Eye,
  FileClock,
  GitCompareArrows,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  ConfidenceState,
  ProcessingStatus,
  ReviewStatus,
  ValidationState,
} from "@invoice/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = NonNullable<BadgeProps["tone"]>;

interface Descriptor {
  label: string;
  tone: Tone;
  Icon: typeof CheckCircle2;
}

/** Icon color per tone, mirroring the Badge palette for consistency in menus/selects. */
const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-primary",
  neutral: "text-muted-foreground",
};

const CONFIDENCE: Record<ConfidenceState, Descriptor> = {
  high: { label: "High confidence", tone: "success", Icon: CheckCircle2 },
  medium: { label: "Review suggested", tone: "warning", Icon: Eye },
  low: { label: "Low confidence", tone: "warning", Icon: AlertTriangle },
  missing: { label: "Missing value", tone: "danger", Icon: CircleSlash },
  conflicting: { label: "Conflicting values", tone: "danger", Icon: GitCompareArrows },
  inferred: { label: "Inferred value", tone: "info", Icon: Sparkles },
};

type ConfidenceChipProps = Readonly<{
  state: ConfidenceState;
  score?: number | null;
}>;

export function ConfidenceChip({ state, score }: ConfidenceChipProps) {
  const d = CONFIDENCE[state];
  const pct = typeof score === "number" ? ` (${Math.round(score * 100)}%)` : "";
  return (
    <Badge tone={d.tone} title={`${d.label}${pct}`}>
      <d.Icon aria-hidden="true" />
      <span>{d.label}</span>
    </Badge>
  );
}

const PROCESSING: Record<ProcessingStatus, Descriptor> = {
  uploaded: { label: "Uploaded", tone: "neutral", Icon: CircleDashed },
  queued: { label: "Queued", tone: "info", Icon: Clock },
  processing: { label: "Processing", tone: "info", Icon: FileClock },
  succeeded: { label: "Extracted", tone: "success", Icon: CheckCircle2 },
  partial: { label: "Partial", tone: "warning", Icon: AlertTriangle },
  failed: { label: "Failed", tone: "danger", Icon: XCircle },
};

type ProcessingStatusBadgeProps = Readonly<{
  status: ProcessingStatus;
  phase?: string | null;
  /** Shorter labels for dense tables; full detail is preserved in the title. */
  compact?: boolean;
}>;

export function ProcessingStatusBadge({
  status,
  phase,
  compact = false,
}: ProcessingStatusBadgeProps) {
  const d = PROCESSING[status];
  const showPhase = (status === "processing" || status === "queued") && phase;
  let label = d.label;
  let title = d.label;
  if (showPhase) {
    if (compact) {
      title = `${d.label}: ${phase}`;
    } else {
      label = phase;
      title = phase;
    }
  }
  return (
    <Badge tone={d.tone} title={title}>
      <d.Icon aria-hidden="true" className={status === "processing" ? "animate-pulse" : undefined} />
      <span>{label}</span>
    </Badge>
  );
}

const REVIEW: Record<ReviewStatus, Descriptor> = {
  not_ready: { label: "Not ready", tone: "neutral", Icon: CircleDashed },
  needs_review: { label: "Needs review", tone: "warning", Icon: Eye },
  ready: { label: "Ready to approve", tone: "info", Icon: CheckCircle2 },
  approved: { label: "Approved", tone: "success", Icon: CheckCircle2 },
  reopened: { label: "Reopened", tone: "warning", Icon: FileClock },
};

type ReviewStatusBadgeProps = Readonly<{
  status: ReviewStatus;
  compact?: boolean;
}>;

export function ReviewStatusBadge({
  status,
  compact = false,
}: ReviewStatusBadgeProps) {
  const d = REVIEW[status];
  const label = compact && status === "ready" ? "Ready" : d.label;
  return (
    <Badge tone={d.tone} title={d.label}>
      <d.Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

type ValidationChipProps = Readonly<{
  state: ValidationState;
  message?: string;
}>;

export function ValidationChip({ state, message }: ValidationChipProps) {
  if (state === "valid" || state === "not_checked") return null;
  const tone: Tone = state === "invalid" ? "danger" : "warning";
  const Icon = state === "invalid" ? XCircle : AlertTriangle;
  const label = state === "invalid" ? "Invalid" : "Warning";
  return (
    <Badge tone={tone} title={message ?? label}>
      <Icon aria-hidden="true" />
      <span>{message ?? label}</span>
    </Badge>
  );
}

type ProcessingStatusIconProps = Readonly<{
  status: ProcessingStatus;
  className?: string;
}>;

/** Compact status icon (no badge chrome) for use inside menus, selects, and inline lists. */
export function ProcessingStatusIcon({ status, className }: ProcessingStatusIconProps) {
  const d = PROCESSING[status];
  return <d.Icon aria-hidden="true" className={cn("size-4 shrink-0", TONE_TEXT[d.tone], className)} />;
}

type ReviewStatusIconProps = Readonly<{
  status: ReviewStatus;
  className?: string;
}>;

export function ReviewStatusIcon({ status, className }: ReviewStatusIconProps) {
  const d = REVIEW[status];
  return <d.Icon aria-hidden="true" className={cn("size-4 shrink-0", TONE_TEXT[d.tone], className)} />;
}

export function reviewStateLabel(state: string): string {
  switch (state) {
    case "auto_accepted": return "Auto-accepted";
    case "confirmed": return "Confirmed";
    case "corrected": return "Corrected";
    case "not_applicable": return "Not applicable";
    default: return "Needs review";
  }
}
