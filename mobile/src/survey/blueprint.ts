// ============================================================
// Survey blueprint — the single source of truth for what a site
// survey captures, in the spec order from .github/copilot-instructions.md:
//   1 Project Arrival → 2 Site Walkaround → 3 Utility Service →
//   4 Electrical Equipment → 5 Roof & Array
//
// Everything (screens, progress, validation, payload) is driven from
// here by id. Labels can be renamed freely; ids must never change once
// shipped, because captured photos and answers are stored by id.
// ============================================================

import type {
  EvidenceCategory,
  SolarProUsageMapping,
  SurveyStepId,
} from "../types/pipeline";

export type InstallType =
  | "roof_mount"
  | "ground_mount"
  | "solar_fencing"
  | "commercial_3phase";

export const INSTALL_TYPES: { id: InstallType; label: string; hint: string }[] = [
  { id: "roof_mount", label: "Roof mount", hint: "Residential roof array" },
  { id: "ground_mount", label: "Ground mount", hint: "Racking on the ground" },
  { id: "solar_fencing", label: "Solar fence", hint: "Vertical bifacial fence" },
  { id: "commercial_3phase", label: "Commercial 3-phase", hint: "Commercial roof, 3-phase service" },
];

export type FieldKind =
  | "text"
  | "multiline"
  | "number"
  | "choice"
  | "multichoice"
  | "yesno"
  | "azimuth"
  | "pitch";

export type AnswerValue = string | number | boolean | string[] | null;

/** Show a field/slot/section only when this holds. All given keys must match. */
export interface Condition {
  /** Field id (same scope: plane fields for plane items, survey fields otherwise). */
  field?: string;
  equals?: string | boolean;
  notEquals?: string | boolean;
  /** For multichoice answers: true when the answer includes any of these. */
  includesAny?: string[];
  /** For multichoice answers: true when the answer has something other than these. */
  hasOtherThan?: string[];
  installTypes?: InstallType[];
}

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  unit?: string;
  options?: string[];
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  showIf?: Condition;
  /** Keyboard hint for text fields. */
  keyboard?: "default" | "numeric" | "decimal-pad";
}

export type GuideId =
  | "address"
  | "house_front"
  | "path"
  | "hazard"
  | "elevation_front"
  | "elevation_back"
  | "elevation_left"
  | "elevation_right"
  | "wide"
  | "shade"
  | "meter_close"
  | "meter_wide"
  | "service_entry"
  | "mast"
  | "lateral"
  | "panel_closed"
  | "panel_open"
  | "label"
  | "breaker"
  | "directory"
  | "subpanel"
  | "ground_rod"
  | "roof_plane"
  | "pitch_gauge"
  | "obstruction"
  | "material"
  | "attic"
  | "array_area"
  | "trench"
  | "fence_line"
  | "foundation";

export interface SlotDef {
  id: string;
  label: string;
  /** One line telling the surveyor what a good shot shows. */
  hint: string;
  required: boolean;
  guide: GuideId;
  requirementId: string;
  usage: SolarProUsageMapping[];
  /** How many photos this slot accepts (default 1). */
  max?: number;
  showIf?: Condition;
}

export interface SectionDef {
  id: string;
  title: string;
  /** "plane" sections repeat once per roof plane; their ids are scoped per plane. */
  repeat?: "plane";
  showIf?: Condition;
  fields: FieldDef[];
  slots: SlotDef[];
}

export interface StepDef {
  id: SurveyStepId;
  number: number;
  title: string;
  short: string;
  evidence: EvidenceCategory;
  sections: SectionDef[];
}

const PITCH_OPTIONS = Array.from({ length: 17 }, (_, i) => `${i}/12`);

export const ROOF_MATERIALS = [
  "Asphalt shingle",
  "Metal (standing seam)",
  "Metal (corrugated)",
  "Concrete tile",
  "Clay tile",
  "Membrane / flat",
  "Wood shake",
  "Slate",
  "Other",
];

export const OBSTRUCTIONS = [
  "Plumbing vent",
  "Exhaust / turbine vent",
  "Skylight",
  "Chimney",
  "Satellite dish",
  "HVAC unit",
  "Tree overhang",
  "None",
];

const ROOF_TYPES: InstallType[] = ["roof_mount", "commercial_3phase"];

export const STEPS: StepDef[] = [
  {
    id: "project_arrival",
    number: 1,
    title: "Project Arrival",
    short: "Arrival",
    evidence: "site_arrival",
    sections: [
      {
        id: "arrival",
        title: "Site verification",
        fields: [
          { id: "site_address", label: "Site address", kind: "text", required: true, placeholder: "Street, city" },
          { id: "access_path", label: "Access path", kind: "multiline", required: true, placeholder: "Gate, side yard, ladder spot…" },
          { id: "gate_code", label: "Gate / lock code", kind: "text" },
          { id: "pets_on_site", label: "Pets on site?", kind: "yesno" },
          { id: "hazards_present", label: "Any site hazards?", kind: "yesno", required: true, help: "Power lines, steep grade, fragile roof, wasps…" },
          { id: "hazards_notes", label: "Describe the hazards", kind: "multiline", required: true, showIf: { field: "hazards_present", equals: true } },
        ],
        slots: [
          { id: "arrival_address", label: "Address marker", hint: "House number or mailbox, readable", required: true, guide: "address", requirementId: "ARRIVAL-ADDRESS", usage: ["Permit Site Plan", "General Documentation"] },
          { id: "arrival_front", label: "Front of home", hint: "Whole front of the house from the street", required: true, guide: "house_front", requirementId: "ARRIVAL-FRONT", usage: ["Permit Site Plan", "General Documentation"] },
          { id: "arrival_access", label: "Access path", hint: "Route to the roof or array area", required: true, guide: "path", requirementId: "ARRIVAL-ACCESS", usage: ["Permit Site Plan", "General Documentation"] },
          { id: "arrival_hazards", label: "Hazards", hint: "Each hazard you listed", required: true, max: 6, guide: "hazard", requirementId: "ARRIVAL-HAZARDS", usage: ["Permit Site Plan", "General Documentation"], showIf: { field: "hazards_present", equals: true } },
        ],
      },
    ],
  },
  {
    id: "site_walkaround",
    number: 2,
    title: "Site Walkaround",
    short: "Walkaround",
    evidence: "site_walkaround",
    sections: [
      {
        id: "elevations",
        title: "Elevations",
        fields: [
          { id: "stories", label: "Stories", kind: "choice", required: true, options: ["1", "2", "3+"] },
          { id: "shading", label: "Shading on array area", kind: "choice", required: true, options: ["None", "Light", "Moderate", "Heavy"] },
        ],
        slots: [
          { id: "walk_front", label: "Front elevation", hint: "Straight on, whole wall and roof line", required: true, guide: "elevation_front", requirementId: "WALK-FRONT", usage: ["Permit Elevation", "CAD Layout"] },
          { id: "walk_right", label: "Right elevation", hint: "Facing the house, the right side", required: true, guide: "elevation_right", requirementId: "WALK-RIGHT", usage: ["Permit Elevation", "CAD Layout"] },
          { id: "walk_back", label: "Back elevation", hint: "Straight on, whole wall and roof line", required: true, guide: "elevation_back", requirementId: "WALK-BACK", usage: ["Permit Elevation", "CAD Layout"] },
          { id: "walk_left", label: "Left elevation", hint: "Facing the house, the left side", required: true, guide: "elevation_left", requirementId: "WALK-LEFT", usage: ["Permit Elevation", "CAD Layout"] },
          { id: "walk_wide", label: "Wide site context", hint: "Corners of the lot, house and array area in frame", required: true, max: 6, guide: "wide", requirementId: "WALK-WIDE", usage: ["Permit Site Plan", "CAD Layout"] },
          { id: "walk_shade", label: "Shade sources", hint: "Trees or buildings that shade the array", required: true, max: 6, guide: "shade", requirementId: "WALK-SHADE", usage: ["CAD Layout"], showIf: { field: "shading", notEquals: "None" } },
        ],
      },
    ],
  },
  {
    id: "utility_service",
    number: 3,
    title: "Utility Service",
    short: "Utility",
    evidence: "utility_service",
    sections: [
      {
        id: "meter",
        title: "Meter & service",
        fields: [
          { id: "utility_provider", label: "Utility", kind: "text", placeholder: "e.g. ComEd, Ameren" },
          { id: "meter_number", label: "Meter number", kind: "text", required: true },
          { id: "service_type", label: "Service drop", kind: "choice", required: true, options: ["Overhead", "Underground"] },
          { id: "service_amps", label: "Service size", kind: "choice", required: true, options: ["100 A", "125 A", "150 A", "200 A", "320 A", "400 A", "Other"] },
        ],
        slots: [
          { id: "utility_meter_close", label: "Meter close-up", hint: "Meter number and dials readable", required: true, guide: "meter_close", requirementId: "UTILITY-METER", usage: ["Interconnection", "Permit Site Plan"] },
          { id: "utility_meter_wide", label: "Meter on the wall", hint: "Meter with the wall and nearby openings", required: true, guide: "meter_wide", requirementId: "UTILITY-METER-WIDE", usage: ["Interconnection", "Permit Site Plan"] },
          { id: "utility_service_entry", label: "Service entry", hint: "Where the service enters the building", required: true, guide: "service_entry", requirementId: "UTILITY-SERVICE-ENTRY", usage: ["Interconnection", "Permit Site Plan"] },
          { id: "utility_riser", label: "Riser / mast", hint: "Mast, weatherhead and drop attachment", required: true, guide: "mast", requirementId: "UTILITY-RISER-MAST", usage: ["Interconnection", "Permit Site Plan"], showIf: { field: "service_type", equals: "Overhead" } },
          { id: "utility_lateral", label: "Underground lateral", hint: "Path of the underground service", required: false, guide: "lateral", requirementId: "UTILITY-LATERAL", usage: ["Interconnection"], showIf: { field: "service_type", equals: "Underground" } },
        ],
      },
    ],
  },
  {
    id: "electrical_equipment",
    number: 4,
    title: "Electrical Equipment",
    short: "Electrical",
    evidence: "electrical_equipment",
    sections: [
      {
        id: "main_panel",
        title: "Main panel",
        fields: [
          { id: "panel_location", label: "Panel location", kind: "choice", required: true, options: ["Garage", "Exterior", "Basement", "Utility room", "Other"] },
          { id: "panel_make", label: "Panel make", kind: "text", placeholder: "e.g. Square D, Eaton" },
          { id: "main_breaker_amps", label: "Main breaker", kind: "number", unit: "A", required: true, min: 0, max: 2000, keyboard: "numeric" },
          { id: "bus_rating_amps", label: "Bus rating", kind: "number", unit: "A", required: true, min: 0, max: 2000, keyboard: "numeric" },
          { id: "open_slots", label: "Open breaker spaces", kind: "number", min: 0, max: 84, keyboard: "numeric" },
        ],
        slots: [
          { id: "elec_panel_closed", label: "Panel, door closed", hint: "Whole panel and clearance around it", required: true, guide: "panel_closed", requirementId: "ELEC-PANEL", usage: ["SLD", "General Documentation"] },
          { id: "elec_panel_open", label: "Panel, door open", hint: "All breakers visible", required: true, guide: "panel_open", requirementId: "ELEC-PANEL-OPEN", usage: ["SLD", "BOM"] },
          { id: "elec_bus_label", label: "Bus rating label", hint: "Manufacturer label, ratings readable", required: true, guide: "label", requirementId: "ELEC-BUS-RATING", usage: ["SLD"] },
          { id: "elec_main_breaker", label: "Main breaker", hint: "Amp rating on the handle readable", required: true, guide: "breaker", requirementId: "ELEC-OCPD", usage: ["SLD"] },
          { id: "elec_directory", label: "Circuit directory", hint: "Whole directory card, readable", required: true, guide: "directory", requirementId: "ELEC-CIRCUIT-DIRECTORY", usage: ["SLD", "General Documentation"] },
          { id: "elec_grounding", label: "Grounding electrode", hint: "Ground rod or bond connection", required: false, guide: "ground_rod", requirementId: "ELEC-GROUNDING", usage: ["SLD"] },
        ],
      },
      {
        id: "sub_panel",
        title: "Sub panel",
        fields: [
          { id: "sub_panel_present", label: "Is there a sub panel?", kind: "yesno", required: true },
          { id: "sub_panel_amps", label: "Sub panel rating", kind: "number", unit: "A", required: true, keyboard: "numeric", showIf: { field: "sub_panel_present", equals: true } },
        ],
        slots: [
          { id: "elec_sub_panel", label: "Sub panel, door open", hint: "Breakers and rating label", required: true, guide: "subpanel", requirementId: "ELEC-SUBPANEL", usage: ["SLD"], showIf: { field: "sub_panel_present", equals: true } },
        ],
      },
    ],
  },
  {
    id: "roof_array",
    number: 5,
    title: "Roof & Array",
    short: "Roof & Array",
    evidence: "roof_array",
    sections: [
      {
        id: "roof_plane",
        title: "Roof plane",
        repeat: "plane",
        showIf: { installTypes: ROOF_TYPES },
        fields: [
          { id: "pitch", label: "Pitch", kind: "pitch", required: true, options: PITCH_OPTIONS },
          { id: "azimuth", label: "Azimuth", kind: "azimuth", unit: "°", required: true, min: 0, max: 359, help: "Direction the plane faces. South = 180°" },
          { id: "material", label: "Material", kind: "choice", required: true, options: ROOF_MATERIALS },
          { id: "obstructions", label: "Obstructions", kind: "multichoice", required: true, options: OBSTRUCTIONS },
          { id: "plane_notes", label: "Notes", kind: "multiline" },
        ],
        slots: [
          { id: "roof_plane_wide", label: "Plane, whole", hint: "Entire plane, eaves to ridge", required: true, guide: "roof_plane", requirementId: "ROOF-PLANE-WIDE", usage: ["CAD Layout", "BOM"] },
          { id: "roof_pitch", label: "Pitch gauge", hint: "Level or pitch app on the plane", required: true, guide: "pitch_gauge", requirementId: "ROOF-PITCH", usage: ["CAD Layout", "Structural Engineering"] },
          { id: "roof_material", label: "Material close-up", hint: "Shingle / panel / tile detail", required: true, guide: "material", requirementId: "ROOF-MATERIAL", usage: ["CAD Layout", "BOM"] },
          { id: "roof_obstructions", label: "Obstructions", hint: "Each vent, skylight or dish on this plane", required: true, max: 8, guide: "obstruction", requirementId: "ROOF-OBSTRUCTIONS", usage: ["CAD Layout", "Permit Elevation"], showIf: { field: "obstructions", hasOtherThan: ["None"] } },
        ],
      },
      {
        id: "roof_structure",
        title: "Roof structure",
        showIf: { installTypes: ROOF_TYPES },
        fields: [
          { id: "rafter_size", label: "Rafter size", kind: "choice", required: true, options: ["2x4", "2x6", "2x8", "Truss", "Unknown"] },
          { id: "rafter_spacing", label: "Rafter spacing", kind: "choice", required: true, options: ["16in", "24in", "Unknown"] },
          { id: "roof_age_years", label: "Roof age", kind: "number", unit: "yrs", min: 0, max: 100, keyboard: "numeric" },
          { id: "roof_layers", label: "Layers of roofing", kind: "choice", options: ["1", "2", "3+"] },
        ],
        slots: [
          { id: "roof_attic", label: "Attic framing", hint: "Rafters or trusses with a tape for spacing", required: true, max: 4, guide: "attic", requirementId: "ROOF-ATTIC", usage: ["Structural Engineering"] },
        ],
      },
      {
        id: "commercial_site",
        title: "Commercial site",
        showIf: { installTypes: ["commercial_3phase"] },
        fields: [
          { id: "parcel_number", label: "Parcel number", kind: "text" },
          { id: "utility_having_jurisdiction", label: "Utility having jurisdiction", kind: "text", required: true },
          { id: "municipality_having_jurisdiction", label: "Municipality having jurisdiction", kind: "text", required: true },
          { id: "nec_code_year", label: "NEC code year", kind: "choice", options: ["2017", "2020", "2023", "2026"] },
          { id: "snow_load_lbs_sqft", label: "Snow load", kind: "number", unit: "lb/ft²", keyboard: "decimal-pad" },
          { id: "max_wind_speed_mph", label: "Design wind speed", kind: "number", unit: "mph", keyboard: "numeric" },
          { id: "wind_exposure", label: "Wind exposure", kind: "choice", options: ["B", "C", "D"] },
          { id: "seismic_rating", label: "Seismic category", kind: "choice", options: ["A", "B", "C", "D", "E", "F"] },
          { id: "building_height_ft", label: "Building height", kind: "number", unit: "ft", keyboard: "decimal-pad" },
          { id: "system_kw", label: "Target system size", kind: "number", unit: "kW", keyboard: "decimal-pad" },
        ],
        slots: [],
      },
      {
        id: "ground_array",
        title: "Array area",
        showIf: { installTypes: ["ground_mount"] },
        fields: [
          { id: "soil_type", label: "Soil", kind: "choice", required: true, options: ["Rocky", "Sandy", "Clay", "Organic/Loam"] },
          { id: "slope_degrees", label: "Slope", kind: "number", unit: "°", required: true, min: 0, max: 45, keyboard: "decimal-pad" },
          { id: "array_azimuth", label: "Array azimuth", kind: "azimuth", unit: "°", required: true, min: 0, max: 359 },
          { id: "trenching_path", label: "Trench path", kind: "multiline", required: true, placeholder: "From array to the house: distance, surface, obstacles" },
          { id: "vegetation_clearing", label: "Vegetation to clear?", kind: "yesno", required: true },
        ],
        slots: [
          { id: "ground_area", label: "Array area", hint: "Whole area with the house for scale", required: true, max: 4, guide: "array_area", requirementId: "GROUND-AREA", usage: ["CAD Layout", "Permit Site Plan"] },
          { id: "ground_trench", label: "Trench path", hint: "Route from the array to the house", required: true, max: 4, guide: "trench", requirementId: "GROUND-TRENCH", usage: ["Permit Site Plan", "BOM"] },
        ],
      },
      {
        id: "fence_array",
        title: "Fence line",
        showIf: { installTypes: ["solar_fencing"] },
        fields: [
          { id: "perimeter_length_ft", label: "Fence length", kind: "number", unit: "ft", required: true, keyboard: "decimal-pad" },
          { id: "fence_azimuth", label: "Fence faces", kind: "azimuth", unit: "°", required: true, min: 0, max: 359 },
          { id: "foundation_type", label: "Foundation", kind: "choice", required: true, options: ["Driven Piles", "Concrete Footer"] },
          { id: "bifacial_surface", label: "Ground surface", kind: "choice", required: true, options: ["Concrete", "Gravel", "Grass", "Dirt"] },
          { id: "lower_shade_risk", label: "Low obstructions shading the panels?", kind: "yesno", required: true },
        ],
        slots: [
          { id: "fence_line", label: "Fence line", hint: "Full run of the planned fence", required: true, max: 4, guide: "fence_line", requirementId: "FENCE-LINE", usage: ["CAD Layout", "Permit Site Plan"] },
          { id: "fence_foundation", label: "Foundation area", hint: "Ground where posts go", required: false, max: 4, guide: "foundation", requirementId: "FENCE-FOUNDATION", usage: ["Structural Engineering"] },
        ],
      },
    ],
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);

export function getStep(id: SurveyStepId): StepDef {
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step ${id}`);
  return step;
}

/** Look up a slot by id, with the step and section it belongs to. */
export function findSlot(
  slotId: string,
): { step: StepDef; section: SectionDef; slot: SlotDef; order: number } | null {
  for (const step of STEPS) {
    for (const section of step.sections) {
      const index = section.slots.findIndex((s) => s.id === slotId);
      if (index >= 0) {
        return { step, section, slot: section.slots[index], order: index + 1 };
      }
    }
  }
  return null;
}

/** Every field id must be unique across the blueprint (plane fields share one scope). */
export function allFieldIds(): string[] {
  return STEPS.flatMap((s) => s.sections.flatMap((sec) => sec.fields.map((f) => f.id)));
}

export function allSlotIds(): string[] {
  return STEPS.flatMap((s) => s.sections.flatMap((sec) => sec.slots.map((sl) => sl.id)));
}
