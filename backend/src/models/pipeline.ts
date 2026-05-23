// ============================================================
// Survey Pipeline — CAD-Ready TypeScript Interfaces (backend)
//
// Mirror of mobile/src/types/pipeline.ts — kept in sync manually.
// Used by backend routes/services that validate, store, or forward
// pipeline-structured survey data to SolarPro.
//
// Source of truth: .github/copilot-instructions.md
// ============================================================

export type SurveyStepId =
  | "project_arrival"
  | "site_walkaround"
  | "utility_service"
  | "electrical_equipment"
  | "roof_array";

export type EvidenceCategory =
  | "site_arrival"
  | "site_walkaround"
  | "utility_service"
  | "electrical_equipment"
  | "roof_array";

export type SolarProUsageMapping =
  | "SLD"
  | "BOM"
  | "Permit Elevation"
  | "Permit Site Plan"
  | "CAD Layout"
  | "Interconnection"
  | "Structural Engineering"
  | "General Documentation";

export type PhotoQualityStatus = "accepted" | "rejected" | "pending_review";

export type ElevationFacing = "Front" | "Back" | "Left" | "Right";

export type RoofMaterial =
  | "Asphalt Shingle"
  | "Metal"
  | "Tile"
  | "Membrane"
  | "Other";

export interface GpsLocation {
  lat: number;
  lng: number;
  alt?: number;
}

/**
 * PhotoMetadata (The Golden Block).
 * Stored as JSONB alongside each record in survey_photos.
 * SolarPro reads these fields to route photos to the correct planset destination.
 */
export interface PhotoMetadata {
  projectId: string;
  surveyId: string;
  stepId: SurveyStepId;
  sectionId: string;
  photoSlotId: string;
  evidenceCategory: EvidenceCategory;
  isRequired: boolean;
  captureOrder: number;
  /** ISO-8601 */
  timestamp: string;
  gps: GpsLocation;
  heading?: number;
  notes?: string;
  retakeReason?: string;
  qualityStatus: PhotoQualityStatus;
  solarProRequirementId: string;
  solarProUsageMapping: SolarProUsageMapping | SolarProUsageMapping[];
}

export interface CapturedPhoto {
  uri: string;
  metadata: PhotoMetadata;
}

export interface PhotoSlot {
  id: string;
  label: string;
  description?: string;
  isRequired: boolean;
  captureOrder: number;
  evidenceCategory: EvidenceCategory;
  solarProRequirementId: string;
  solarProUsageMapping: SolarProUsageMapping | SolarProUsageMapping[];
  captured?: CapturedPhoto;
}

export interface SurveySection {
  id: string;
  label: string;
  stepId: SurveyStepId;
  /** Required for all sections inside the `roof_array` step. */
  planeId?: string;
  slots: PhotoSlot[];
}

export interface SurveyStep {
  id: SurveyStepId;
  label: string;
  captureOrder: number;
  sections: SurveySection[];
}

export interface ProjectArrivalData {
  address: string;
  accessPath: string;
  hazardsObserved: string;
  arrivalTime: string;
}

export interface UtilityServiceData {
  utilityProvider: string;
  meterNumber: string;
  serviceEntryType: "Overhead" | "Underground";
  riserMastPresent: boolean;
  riserMastNotes?: string;
}

export interface ElectricalEquipmentData {
  mainPanelRating: number;
  busRating: number;
  ocpdRating: number;
  circuitDirectory: string[];
  panelManufacturer?: string;
  panelModel?: string;
}

export interface RoofPlane {
  planeId: string;
  pitch: number;
  azimuth: number;
  obstructions: string[];
  material: RoofMaterial;
  sections: SurveySection[];
}

export interface PipelineSurvey {
  surveyId: string;
  projectId: string;
  steps: SurveyStep[];
  arrivalData?: ProjectArrivalData;
  utilityServiceData?: UtilityServiceData;
  electricalData?: ElectricalEquipmentData;
  roofPlanes: RoofPlane[];
}

