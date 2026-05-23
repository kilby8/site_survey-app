import type { PhotoSlot, SurveyStep } from "./pipeline";

/**
 * Minimal required-photo blueprint for the CAD-ready pipeline.
 *
 * The current app stores photos as a flat list, so slot fulfillment is mapped
 * by capture order (photo index). This keeps enforcement deterministic until
 * slot-to-photo IDs are wired into capture UI.
 */
export const CAD_READY_PIPELINE_STEPS: SurveyStep[] = [
  {
    id: "project_arrival",
    label: "Project Arrival",
    captureOrder: 1,
    sections: [
      {
        id: "arrival-site-verification",
        label: "Site Verification",
        stepId: "project_arrival",
        slots: [
          {
            id: "arrival-address-evidence",
            label: "Address / Property Front",
            description: "Capture front-of-property evidence with visible address markers.",
            isRequired: true,
            captureOrder: 1,
            evidenceCategory: "site_arrival",
            solarProRequirementId: "ARRIVAL-ADDRESS",
            solarProUsageMapping: ["Permit Site Plan", "General Documentation"],
          },
        ],
      },
    ],
  },
  {
    id: "site_walkaround",
    label: "Site Walkaround",
    captureOrder: 2,
    sections: [
      {
        id: "walkaround-elevations",
        label: "Elevations",
        stepId: "site_walkaround",
        slots: [
          {
            id: "walk-front",
            label: "Front Elevation",
            isRequired: true,
            captureOrder: 2,
            evidenceCategory: "site_walkaround",
            solarProRequirementId: "WALK-FRONT",
            solarProUsageMapping: ["Permit Elevation", "CAD Layout"],
          },
          {
            id: "walk-back",
            label: "Back Elevation",
            isRequired: true,
            captureOrder: 3,
            evidenceCategory: "site_walkaround",
            solarProRequirementId: "WALK-BACK",
            solarProUsageMapping: ["Permit Elevation", "CAD Layout"],
          },
        ],
      },
    ],
  },
  {
    id: "utility_service",
    label: "Utility Service",
    captureOrder: 3,
    sections: [
      {
        id: "utility-meter",
        label: "Meter Evidence",
        stepId: "utility_service",
        slots: [
          {
            id: "utility-meter-close",
            label: "Meter Close-Up",
            isRequired: true,
            captureOrder: 4,
            evidenceCategory: "utility_service",
            solarProRequirementId: "UTILITY-METER",
            solarProUsageMapping: ["Interconnection", "Permit Site Plan"],
          },
        ],
      },
    ],
  },
  {
    id: "electrical_equipment",
    label: "Electrical Equipment",
    captureOrder: 4,
    sections: [
      {
        id: "electrical-main-panel",
        label: "Main Panel",
        stepId: "electrical_equipment",
        slots: [
          {
            id: "electrical-main-panel-open",
            label: "Main Panel (Open)",
            isRequired: true,
            captureOrder: 5,
            evidenceCategory: "electrical_equipment",
            solarProRequirementId: "ELEC-PANEL-OPEN",
            solarProUsageMapping: ["SLD", "Structural Engineering"],
          },
        ],
      },
    ],
  },
  {
    id: "roof_array",
    label: "Roof & Array",
    captureOrder: 5,
    sections: [
      {
        id: "roof-plane-primary",
        label: "Primary Roof Plane",
        stepId: "roof_array",
        planeId: "primary",
        slots: [
          {
            id: "roof-plane-wide",
            label: "Roof Plane Wide Shot",
            isRequired: true,
            captureOrder: 6,
            evidenceCategory: "roof_array",
            solarProRequirementId: "ROOF-PLANE-WIDE",
            solarProUsageMapping: ["CAD Layout", "BOM"],
          },
        ],
      },
    ],
  },
];

export type RequiredPipelineSlot = PhotoSlot & {
  stepId: SurveyStep["id"];
  stepLabel: string;
};

export function getRequiredPipelineSlots(
  steps: SurveyStep[] = CAD_READY_PIPELINE_STEPS,
): RequiredPipelineSlot[] {
  return steps
    .flatMap((step) =>
      step.sections.flatMap((section) =>
        section.slots
          .filter((slot) => slot.isRequired)
          .map((slot) => ({
            ...slot,
            stepId: step.id,
            stepLabel: step.label,
          })),
      ),
    )
    .sort((a, b) => a.captureOrder - b.captureOrder);
}

export function getPipelinePhotoProgress(photoCount: number): {
  totalRequired: number;
  completedRequired: number;
  missingSlots: RequiredPipelineSlot[];
  byStep: Array<{ stepId: SurveyStep["id"]; stepLabel: string; required: number; completed: number }>;
} {
  const requiredSlots = getRequiredPipelineSlots();
  const completedRequired = Math.min(photoCount, requiredSlots.length);
  const missingSlots = requiredSlots.slice(completedRequired);

  const byStep = CAD_READY_PIPELINE_STEPS.map((step) => {
    const requiredForStep = requiredSlots.filter((slot) => slot.stepId === step.id);
    const completedForStep = requiredForStep.filter(
      (slot) => slot.captureOrder <= completedRequired,
    ).length;
    return {
      stepId: step.id,
      stepLabel: step.label,
      required: requiredForStep.length,
      completed: completedForStep,
    };
  });

  return {
    totalRequired: requiredSlots.length,
    completedRequired,
    missingSlots,
    byStep,
  };
}

