import type { InterpretedChip } from "@invoice/contracts";
import type { BadgeProps } from "@/components/ui/badge";

/** Map interpreted filter chips to tones that reflect what kind of constraint they are. */
export function interpretationChipTone(key: InterpretedChip["key"]): NonNullable<BadgeProps["tone"]> {
  switch (key) {
    case "amount":
    case "currency":
      return "success";
    case "reviewStatus":
    case "processingStatus":
      return "warning";
    case "search":
    case "fields":
      return "info";
    default:
      return "neutral";
  }
}
