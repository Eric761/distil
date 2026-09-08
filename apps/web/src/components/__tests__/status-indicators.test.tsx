import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ConfidenceChip,
  ProcessingStatusBadge,
  ReviewStatusBadge,
  ValidationChip,
} from "../status-indicators";

describe("status indicators", () => {
  it("renders distinct, text-labelled confidence states (not color-only)", () => {
    const { rerender } = render(<ConfidenceChip state="high" score={0.98} />);
    expect(screen.getByText("High confidence")).toBeInTheDocument();

    rerender(<ConfidenceChip state="conflicting" />);
    expect(screen.getByText("Conflicting values")).toBeInTheDocument();

    rerender(<ConfidenceChip state="missing" />);
    expect(screen.getByText("Missing value")).toBeInTheDocument();
  });

  it("shows a rounded percentage in the confidence title when a score is given", () => {
    render(<ConfidenceChip state="high" score={0.976} />);
    expect(screen.getByTitle("High confidence (98%)")).toBeInTheDocument();
  });

  it("renders review statuses as text", () => {
    const { rerender } = render(<ReviewStatusBadge status="needs_review" />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    rerender(<ReviewStatusBadge status="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("prefers the live phase text while processing", () => {
    render(<ProcessingStatusBadge status="processing" phase="Reading layout" />);
    expect(screen.getByText("Reading layout")).toBeInTheDocument();
  });

  it("renders nothing for valid or unchecked validation, but shows invalid/warning messages", () => {
    const { container, rerender } = render(<ValidationChip state="valid" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ValidationChip state="not_checked" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ValidationChip state="invalid" message="Enter a valid number." />);
    expect(screen.getByText("Enter a valid number.")).toBeInTheDocument();

    rerender(<ValidationChip state="warning" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });
});
