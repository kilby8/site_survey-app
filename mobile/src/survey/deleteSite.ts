// ============================================================
// Deleting a site from the home list: what the confirmation says,
// and whether it's allowed right now.
// ============================================================

import type { SurveySummary } from "./repo";

export type DeletePrompt =
  | { allowed: false; title: string; message: string }
  | { allowed: true; title: string; message: string; button: string };

export function deletePrompt(row: Pick<SurveySummary, "kind" | "status" | "syncStatus" | "photoCount" | "uploadedCount" | "title">): DeletePrompt {
  const unsent = Math.max(0, row.photoCount - row.uploadedCount);
  const lost = unsent ? ` ${unsent} photo${unsent === 1 ? " hasn't" : "s haven't"} been sent yet and will be lost.` : "";

  if (row.syncStatus === "syncing") {
    return { allowed: false, title: "Uploading right now", message: `${row.title} is uploading. Try again when it's finished.` };
  }
  if (row.kind === "install") {
    return {
      allowed: true,
      title: "Remove this job from this phone?",
      message: `Photos already sent stay with the crew and in SolarPro.${lost}`,
      button: "Remove",
    };
  }
  if (row.status === "draft") {
    return {
      allowed: true,
      title: "Delete this survey?",
      message: "Everything captured for it is deleted from this phone. This can't be undone.",
      button: "Delete",
    };
  }
  if (row.syncStatus === "synced") {
    return {
      allowed: true,
      title: "Remove from this phone?",
      message: "It stays in SolarPro. Its photos are removed from this phone to free space.",
      button: "Remove",
    };
  }
  return {
    allowed: true,
    title: "Delete before it uploads?",
    message: `It hasn't reached SolarPro yet, so it will be gone for good.${lost}`,
    button: "Delete",
  };
}
