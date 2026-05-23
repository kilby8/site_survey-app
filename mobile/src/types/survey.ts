// ============================================================
// Core survey domain types — DB records, API shapes, UI constants
//
// These types represent the flat persistence / API layer.
// For the structured CAD-Ready capture pipeline, see pipeline.ts.
// ============================================================

export type SurveyStatus = "draft" | "submitted" | "synced";
export type SyncStatus = "pending" | "syncing" | "synced" | "error";
export type ChecklistStatus = "pass" | "fail" | "n/a" | "pending";

// ------------------------------------------------------------------
// Solar installation category-specific metadata
// Stored as JSONB on the server and as JSON text in local SQLite.
// The `type` discriminator matches the category_id slug.
// ------------------------------------------------------------------

export interface GroundMountMetadata {
  type: "ground_mount";
  soil_type: "Rocky" | "Sandy" | "Clay" | "Organic/Loam" | null;
  slope_degrees: number | null;
  trenching_path: string;
  vegetation_clearing: boolean;
}

export interface RoofMountMetadata {
  type: "roof_mount";
  roof_material: "Asphalt Shingle" | "Metal" | "Tile" | "Membrane" | null;
  rafter_size: "2x4" | "2x6" | "2x8" | null;
  rafter_spacing: "16in" | "24in" | null;
  roof_age_years: number | null;
  azimuth: "N" | "S" | "E" | "W" | null;
  rafter_photo_uri?: string | null;
}

export interface SolarFencingMetadata {
  type: "solar_fencing";
  perimeter_length_ft: number | null;
  lower_shade_risk: boolean;
  foundation_type: "Driven Piles" | "Concrete Footer" | null;
  bifacial_surface: "Concrete" | "Gravel" | "Grass" | "Dirt" | null;
}

export interface CommercialThreePhaseMetadata {
  type: "commercial_3phase";
  // 1) Project Site Information
  customer_name: string;
  customer_address: string;
  city: string;
  state: string;
  zip: string;
  parcel_number: string;
  utility_having_jurisdiction: string;
  municipality_having_jurisdiction: string;
  nec_code_year: number | null;
  // 2) Environmental & Structural Constraints
  snow_load_lbs_sqft: number | null;
  seismic_rating: "A" | "B" | "C" | "D" | "E" | "F" | null;
  building_height_ft: number | null;
  max_wind_speed_mph: number | null;
  wind_exposure: "B" | "C" | "D" | null;
  // 3) PV System Information
  desired_pv_system_size_kw_dc: number | null;
  module_make_model: string;
  number_of_modules: number | null;
  module_tilt_angle_deg: number | null;
  module_azimuth_deg: number | null;
}

export type SurveyMetadata =
  | GroundMountMetadata
  | RoofMountMetadata
  | SolarFencingMetadata
  | CommercialThreePhaseMetadata;

// ------------------------------------------------------------------
// GPS coordinate shape used by legacy location components
// Note: pipeline.ts uses GpsLocation (lat/lng); this uses latitude/longitude.
// ------------------------------------------------------------------

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// ------------------------------------------------------------------
// Core domain models (DB record shapes)
// ------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  survey_id: string;
  label: string;
  status: ChecklistStatus;
  notes: string;
  sort_order: number;
  created_at: string;
}

export interface SurveyPhoto {
  id: string;
  survey_id: string;
  /** Absolute local path inside the app's document directory */
  file_path: string;
  label: string;
  mime_type: string;
  captured_at: string;
  created_at: string;
}

export interface Survey {
  id: string;
  project_name: string;
  project_id: string | null;
  category_id: string | null;
  category_name: string | null;
  inspector_name: string;
  site_name?: string;
  site_address: string;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy: number | null;
  survey_date: string;
  notes: string;
  /** Server-facing status */
  status: SurveyStatus;
  /** Offline-sync tracking status (local only) */
  sync_status: SyncStatus;
  sync_error: string | null;
  device_id: string | null;
  solarpro_user_id?: string | null;
  solarpro_project_id?: string | null;
  solarpro_email?: string | null;
  solarpro_org_id?: string | null;
  /** Category-specific fields — Ground Mount / Roof Mount / Solar Fencing */
  metadata: SurveyMetadata | null;
  created_at: string;
  updated_at: string;
  /** Hydrated relations — populated when loading a full survey */
  checklist: ChecklistItem[];
  photos: SurveyPhoto[];
}

export type SurveyFormData = Omit<
  Survey,
  | "id"
  | "sync_status"
  | "sync_error"
  | "created_at"
  | "updated_at"
  | "checklist"
  | "photos"
> & {
  checklist: Omit<ChecklistItem, "id" | "survey_id" | "created_at">[];
  photos: Omit<SurveyPhoto, "id" | "survey_id" | "created_at">[];
};

// ------------------------------------------------------------------
// API response shapes
// ------------------------------------------------------------------

export interface ApiSurveyListResponse {
  surveys: Survey[];
  total: number;
}

export interface ApiSyncResponse {
  synced: number;
  results: Array<{
    id: string;
    action: string;
    success: boolean;
    error?: string;
  }>;
}

export interface ApiPhotoUploadResponse {
  uploaded: number;
  photos: unknown[];
}


// ------------------------------------------------------------------
// Default checklist items for new surveys
// ------------------------------------------------------------------

export const DEFAULT_CHECKLIST: Omit<
  ChecklistItem,
  "id" | "survey_id" | "created_at"
>[] = [
  // 1) Project Arrival
  { label: "Arrival: Address Verification", status: "pending", notes: "", sort_order: 0 },
  { label: "Arrival: Access Path Check", status: "pending", notes: "", sort_order: 1 },
  { label: "Arrival: Hazards Logged", status: "pending", notes: "", sort_order: 2 },

  // 2) Site Walkaround
  { label: "Walkaround: Front/Back/Left/Right Elevations", status: "pending", notes: "", sort_order: 3 },
  { label: "Walkaround: CAD Context Wide Shots", status: "pending", notes: "", sort_order: 4 },

  // 3) Roof & Array
  { label: "Roof: Plane Pitch/Azimuth/Obstructions", status: "pending", notes: "", sort_order: 5 },
  { label: "Roof: Plane Material + Plane ID Association", status: "pending", notes: "", sort_order: 6 },

  // 4) Utility Service
  { label: "Utility: Meter Evidence Captured", status: "pending", notes: "", sort_order: 7 },
  { label: "Utility: Service Entry + Riser/Mast", status: "pending", notes: "", sort_order: 8 },

  // 5) Electrical Equipment
  { label: "Electrical: Main Panel + Bus + OCPD", status: "pending", notes: "", sort_order: 9 },
  { label: "Electrical: Circuit Directory Recorded", status: "pending", notes: "", sort_order: 10 },
];

export const SURVEY_CATEGORIES = [
  { id: "", name: "Select category…" },
  { id: "electrical", name: "Electrical" },
  { id: "structural", name: "Structural" },
  { id: "network", name: "Network/Comms" },
  { id: "environmental", name: "Environmental" },
  { id: "safety", name: "Safety" },
  { id: "general", name: "General Inspection" },
  // Solar installation categories — trigger category-specific metadata sections
  { id: "ground_mount", name: "Ground Mount" },
  { id: "roof_mount", name: "Roof Mount" },
  { id: "solar_fencing", name: "Solar Fencing" },
  { id: "commercial_3phase", name: "Commercial 3-Phase Solar" },
];
