// ============================================================
// Survey Pipeline — CAD-Ready TypeScript Interfaces
//
// Canonical types for the 5-step structured survey capture flow.
// Every photo captured in the app MUST carry a PhotoMetadata
// ("Golden Block") to feed SLD, BOM, and CAD automated workflows.
//
// Source of truth: .github/copilot-instructions.md
// ============================================================

// ------------------------------------------------------------------
// Enumerated value types
// ------------------------------------------------------------------

/** The five sequential steps every survey follows. */
export type SurveyStepId =
  | "project_arrival"
  | "site_walkaround"
  | "utility_service"
  | "electrical_equipment"
  | "roof_array";

/** Top-level evidence category — matches the step the photo belongs to. */
export type EvidenceCategory =
  | "site_arrival"
  | "site_walkaround"
  | "utility_service"
  | "electrical_equipment"
  | "roof_array";

/**
 * Where this photo/data point lands in the final SolarPro planset.
 * Treat as the source of truth for downstream CAD/Permit/Engineering routing.
 */
export type SolarProUsageMapping =
  | "SLD"
  | "BOM"
  | "Permit Elevation"
  | "Permit Site Plan"
  | "CAD Layout"
  | "Interconnection"
  | "Structural Engineering"
  | "General Documentation";

/** Quality gate result for a captured photo. */
export type PhotoQualityStatus = "accepted" | "rejected" | "pending_review";

/** Cardinal elevations captured during the Site Walkaround step. */
export type ElevationFacing = "Front" | "Back" | "Left" | "Right";

/** Supported roof materials for Roof & Array plane analysis. */
export type RoofMaterial =
  | "Asphalt Shingle"
  | "Metal"
  | "Tile"
  | "Membrane"
  | "Other";

// ------------------------------------------------------------------
// GPS
// ------------------------------------------------------------------

/** Full GPS fix including optional altitude. */
export interface GpsLocation {
  lat: number;
  lng: number;
  /** Meters above sea level. */
  alt?: number;
}

// ------------------------------------------------------------------
// The Golden Block — required metadata on every captured photo
// ------------------------------------------------------------------

/**
 * PhotoMetadata (The Golden Block).
 *
 * EVERY photo captured in the app must carry this object.
 * It is the bridge between field capture and CAD/Permit/Engineering pipelines.
 *
 * Required fields enforce supply of projectId, surveyId, step/section/slot
 * identity, evidence classification, GPS, and planset routing.
 */
export interface PhotoMetadata {
  // ── Identity ────────────────────────────────────────────────────
  projectId: string;
  surveyId: string;
  stepId: SurveyStepId;
  sectionId: string;
  photoSlotId: string;
  evidenceCategory: EvidenceCategory;

  // ── Capture sequencing ──────────────────────────────────────────
  /** Whether this slot must be filled before the step can be completed. */
  isRequired: boolean;
  /** Intended capture order within the section (1-based). */
  captureOrder: number;
  /** ISO-8601 timestamp of shutter press. */
  timestamp: string;

  // ── Spatial context ─────────────────────────────────────────────
  gps: GpsLocation;
  /** Camera-facing direction in degrees (0 = North, 90 = East, …). */
  heading?: number;

  // ── Annotations ─────────────────────────────────────────────────
  notes?: string;
  /** Required when this photo replaces a previously captured one. */
  retakeReason?: string;
  qualityStatus: PhotoQualityStatus;

  // ── SolarPro pipeline routing ────────────────────────────────────
  /** Requirement ID from SolarPro's planset checklist. */
  solarProRequirementId: string;
  /**
   * One or more planset destinations.
   * e.g. ["SLD", "Permit Elevation"] for a main-panel wide-shot.
   */
  solarProUsageMapping: SolarProUsageMapping | SolarProUsageMapping[];
}

// ------------------------------------------------------------------
// Photo Slot — a defined capture requirement within a Section
// ------------------------------------------------------------------

/** A captured photo paired with its immutable Golden Block metadata. */
export interface CapturedPhoto {
  /** Local file URI or remote URL after upload. */
  uri: string;
  metadata: PhotoMetadata;
}

/**
 * PhotoSlot defines WHAT the surveyor must photograph.
 * Once captured, `captured` is populated with the photo + metadata.
 * Required slots cannot be skipped without a validation override.
 */
export interface PhotoSlot {
  /** Stable identifier — becomes `photoSlotId` in PhotoMetadata. */
  id: string;
  label: string;
  description?: string;
  isRequired: boolean;
  /** Desired capture order within the parent section (1-based). */
  captureOrder: number;
  evidenceCategory: EvidenceCategory;
  solarProRequirementId: string;
  solarProUsageMapping: SolarProUsageMapping | SolarProUsageMapping[];
  /** Populated once the surveyor taps Capture and confirms quality. */
  captured?: CapturedPhoto;
}

// ------------------------------------------------------------------
// Survey Section — groups related PhotoSlots within a step
// ------------------------------------------------------------------

/**
 * SurveySection organises photo slots (and associated data fields)
 * within a step. For Roof & Array, every section MUST carry a `planeId`
 * tying photos to a specific roof plane.
 */
export interface SurveySection {
  /** Stable identifier — becomes `sectionId` in PhotoMetadata. */
  id: string;
  label: string;
  stepId: SurveyStepId;
  /**
   * Required for any section inside the `roof_array` step.
   * Associates every photo in this section with a specific roof plane.
   */
  planeId?: string;
  slots: PhotoSlot[];
}

// ------------------------------------------------------------------
// Survey Step — one of the five sequential pipeline stages
// ------------------------------------------------------------------

/**
 * SurveyStep represents one of the five CAD-Ready pipeline stages.
 * Steps are completed in `captureOrder` order; skipping a step that
 * contains required photo slots must trigger a validation override.
 */
export interface SurveyStep {
  id: SurveyStepId;
  label: string;
  /** 1-based position in the overall survey flow. */
  captureOrder: number;
  sections: SurveySection[];
}

// ------------------------------------------------------------------
// Step-specific structured data payloads
// ------------------------------------------------------------------

/** Step 1 — Project Arrival: site identification and access logging. */
export interface ProjectArrivalData {
  address: string;
  accessPath: string;
  hazardsObserved: string;
  /** ISO-8601 timestamp when the surveyor arrived on site. */
  arrivalTime: string;
}

/** Step 3 — Utility Service: meter and service-entry evidence. */
export interface UtilityServiceData {
  utilityProvider: string;
  meterNumber: string;
  serviceEntryType: "Overhead" | "Underground";
  riserMastPresent: boolean;
  riserMastNotes?: string;
}

/** Step 4 — Electrical Equipment: panel data for SLD / Engineering. */
export interface ElectricalEquipmentData {
  mainPanelRating: number;   // amps
  busRating: number;          // amps
  ocpdRating: number;         // amps, main breaker overcurrent protection
  /** Directory labels, one entry per breaker slot. */
  circuitDirectory: string[];
  panelManufacturer?: string;
  panelModel?: string;
}

/**
 * Step 5 — Roof Plane: per-plane structural data for CAD layout.
 * Always associate photos and data with the matching `planeId`.
 */
export interface RoofPlane {
  /** Stable plane identifier referenced by all photos in this plane. */
  planeId: string;
  /** Roof pitch in degrees. */
  pitch: number;
  /** Azimuth of the plane facing direction in degrees (0 = North). */
  azimuth: number;
  obstructions: string[];
  material: RoofMaterial;
  /** Sections defined for this specific plane. */
  sections: SurveySection[];
}

// ------------------------------------------------------------------
// Full pipeline survey shape
// ------------------------------------------------------------------

/**
 * PipelineSurvey is the top-level container for the 5-step CAD-Ready
 * survey. It maps 1-to-1 with a `Survey` record but carries the
 * fully-typed pipeline structure instead of the flat metadata blob.
 */
export interface PipelineSurvey {
  surveyId: string;
  projectId: string;
  steps: SurveyStep[];
  // Step-scoped data payloads
  arrivalData?: ProjectArrivalData;
  utilityServiceData?: UtilityServiceData;
  electricalData?: ElectricalEquipmentData;
  roofPlanes: RoofPlane[];
}

