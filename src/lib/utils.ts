import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function platformIcon(platform: string | null): string {
  switch (platform) {
    case "zoom":
      return "📹";
    case "google_meet":
      return "🎥";
    case "teams":
      return "💼";
    case "slack":
      return "💬";
    case "webex":
      return "🌐";
    default:
      return "🎙️";
  }
}

export function platformLabel(platform: string | null): string {
  switch (platform) {
    case "zoom":
      return "Zoom";
    case "google_meet":
      return "Google Meet";
    case "teams":
      return "Microsoft Teams";
    case "slack":
      return "Slack";
    case "webex":
      return "Webex";
    default:
      return "Other";
  }
}

export const DEFAULT_TEMPLATES = [
  {
    name: "Customer Discovery Call",
    description: "Template for customer discovery and user research calls",
    content: `## Meeting Overview
**Date:**
**Participants:**
**Company/Customer:**

## Goals
What we wanted to learn from this call.

## Customer Background
Brief context about the customer/user.

## Key Pain Points
Main problems they shared.

## Current Solutions
What they're currently using or doing.

## Insights & Quotes
Notable quotes and insights.

## Opportunities
Potential opportunities identified.

## Action Items
- [ ]

## Next Steps
`,
  },
  {
    name: "1-on-1",
    description: "Template for regular 1-on-1 meetings",
    content: `## 1-on-1 Check-in

**Date:**
**Participants:**

## Updates & Progress
What's been accomplished since last meeting.

## Challenges & Blockers
Current obstacles or challenges.

## Priorities
Focus areas for the coming period.

## Career & Growth
Development topics discussed.

## Feedback
Any feedback exchanged.

## Action Items
- [ ]

## Next Meeting Topics
`,
  },
  {
    name: "Product Review",
    description: "Template for product reviews and demos",
    content: `## Product Review

**Date:**
**Product/Feature:**
**Participants:**

## Overview
What was reviewed.

## Demo Notes
Key points from the demo.

## Feedback Received
Specific feedback and reactions.

## Issues Identified
Bugs or concerns raised.

## Decisions Made
Product decisions reached.

## Action Items
- [ ]

## Follow-up Required
`,
  },
  {
    name: "Sales Call",
    description: "Template for sales and business development calls",
    content: `## Sales Call

**Date:**
**Prospect/Client:**
**Contact:**
**Stage:**

## Company Context
Background on the company.

## Pain Points & Needs
Key challenges they expressed.

## Our Solution Fit
How we address their needs.

## Budget & Timeline
Budget range and decision timeline.

## Objections & Responses
Concerns raised and how addressed.

## Competitors Mentioned
Other solutions they're evaluating.

## Next Steps
- [ ]

## Follow-up Date
`,
  },
];
