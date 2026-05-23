// ============================================================
// Types barrel — re-exports from all type modules.
// Import from here as before: import type { Survey } from '../types'
// ============================================================

// CAD-Ready pipeline types (Golden Block, Photo Slots, Steps, Sections)
export type {
  SurveyStepId,
  EvidenceCategory,
  SolarProUsageMapping,
  PhotoQualityStatus,
  ElevationFacing,
  RoofMaterial,
  GpsLocation,
  PhotoMetadata,
  CapturedPhoto,
  PhotoSlot,
  SurveySection,
  SurveyStep,
  ProjectArrivalData,
  UtilityServiceData,
  ElectricalEquipmentData,
  RoofPlane,
  PipelineSurvey,
} from "./pipeline";

// Core survey domain types (DB records, API shapes, UI constants)
export type {
  SurveyStatus,
  SyncStatus,
  ChecklistStatus,
  GroundMountMetadata,
  RoofMountMetadata,
  SolarFencingMetadata,
  CommercialThreePhaseMetadata,
  SurveyMetadata,
  GpsCoordinates,
  ChecklistItem,
  SurveyPhoto,
  Survey,
  SurveyFormData,
  ApiSurveyListResponse,
  ApiSyncResponse,
  ApiPhotoUploadResponse,
  AddressValidationRequest,
  AddressValidationGranularity,
  AddressValidationResult,
} from "./survey";

// Value exports (constants are not types — cannot use `export type`)
export { DEFAULT_CHECKLIST, SURVEY_CATEGORIES } from "./survey";
