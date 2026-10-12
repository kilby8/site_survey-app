// ============================================================
// Install & final photos — what the crew documents on install day and
// at the final / pre-inspection visit. Built from Under The Sun's real
// CompanyCam reports (Andrew Lindsey job): every shot the crew took there
// is a named slot here, so captions are consistent and nothing is missed.
//
// Ids must never change once shipped (photos and answers are stored by id).
// Slot ids start with "inst_" (install day) or "fin_" (final).
// ============================================================

import type { SlotDef, StepDef } from "./blueprint";

const I = ["Inspection", "General Documentation"] as const;
const slot = (s: Omit<SlotDef, "requirementId" | "usage"> & { req?: string }): SlotDef => ({
  ...s,
  requirementId: s.req ?? s.id.toUpperCase(),
  usage: [...I],
});

export const INSTALL_STEPS: StepDef[] = [
  {
    id: "install_day",
    number: 1,
    title: "Install day — racking & electronics",
    short: "Install day",
    evidence: "install_day",
    sections: [
      {
        id: "inst_roof",
        title: "Roof attachments & racking",
        fields: [
          {
            id: "attachment_type",
            label: "Attachment",
            kind: "choice",
            options: ["Flashed L-foot", "Rafter hook", "Rail-less mount", "Ballast", "Ground mount", "Other"],
          },
        ],
        slots: [
          slot({ id: "inst_feet", label: "Feet in rafters", hint: "Close-up of feet lagged into rafters", required: true, max: 6, guide: "material" }),
          slot({ id: "inst_seal", label: "Flashing / sealant", hint: "Butyl or flashing under a foot, close-up", required: true, max: 4, guide: "material" }),
          slot({ id: "inst_rail_foot", label: "Rail on foot", hint: "Rail clamped to a foot", required: true, max: 3, guide: "roof_plane" }),
          slot({ id: "inst_bonding", label: "Rail bonding / EGC", hint: "Ground lug or splice joining rails", required: true, max: 3, guide: "label" }),
          slot({ id: "inst_rails_wide", label: "Rails on roof (wide)", hint: "Whole array area with rails installed", required: true, max: 4, guide: "roof_plane" }),
        ],
      },
      {
        id: "inst_mlpe",
        title: "Inverters & roof wiring",
        fields: [{ id: "inverter_count", label: "Micro / optimizer count", kind: "number", keyboard: "numeric", min: 0, max: 500 }],
        slots: [
          slot({ id: "inst_mlpe_mounted", label: "Micro / optimizer mounted", hint: "One unit on the rail, close", required: true, max: 3, guide: "material" }),
          slot({ id: "inst_sticker_map", label: "Serial sticker map", hint: "The sheet with every serial sticker, flat and readable", required: true, max: 4, guide: "label" }),
          slot({ id: "inst_mlpe_wiring", label: "Trunk cable & wire management", hint: "Cable clipped to rails, nothing on the roof", required: false, max: 4, guide: "roof_plane" }),
          slot({ id: "inst_jbox", label: "Roof J-box / Soladeck", hint: "Box sealed; lid off showing wiring and washer", required: true, max: 3, guide: "label" }),
        ],
      },
      {
        id: "inst_conduit",
        title: "Conduit run",
        fields: [],
        slots: [
          slot({ id: "inst_conduit_roof", label: "Conduit from roof", hint: "Roof entry to the run, strapped", required: true, max: 3, guide: "roof_plane" }),
          slot({ id: "inst_conduit_attic", label: "Conduit in attic", hint: "Run strapped at rafters", required: false, max: 3, guide: "attic" }),
          slot({ id: "inst_conduit_wall", label: "Conduit on wall", hint: "Strapped run down to the equipment", required: true, max: 3, guide: "wide" }),
        ],
      },
      {
        id: "inst_elec",
        title: "Electrical",
        fields: [
          { id: "interconnection", label: "Interconnection", kind: "choice", options: ["Load-side breaker", "Supply-side tap", "Line-side tap", "Main panel upgrade", "Other"] },
          { id: "cell_modem", label: "Cell modem installed?", kind: "yesno" },
        ],
        slots: [
          slot({ id: "inst_equip_wide", label: "Equipment wall (pull back)", hint: "All new equipment in one shot", required: true, max: 3, guide: "wide" }),
          slot({ id: "inst_disconnect", label: "AC disconnect wired", hint: "Cover off, wiring visible", required: true, max: 2, guide: "panel_open" }),
          slot({ id: "inst_combiner", label: "Combiner / gateway wired", hint: "IQ Combiner or Envoy, cover off", required: true, max: 3, guide: "panel_open" }),
          slot({ id: "inst_cts", label: "CTs installed", hint: "CTs on the mains, arrows toward the load", required: true, max: 3, guide: "panel_open" }),
          slot({ id: "inst_breaker", label: "PV breaker in MSP", hint: "Interconnection breaker and its position", required: true, max: 2, guide: "breaker" }),
          slot({ id: "inst_entries", label: "Weep holes & sealed entries", hint: "LB weep holes, sealant at box entries", required: false, max: 4, guide: "service_entry" }),
          slot({ id: "inst_msp_closed", label: "MSP dead front on", hint: "Panel closed up after the tie-in", required: true, max: 2, guide: "panel_closed" }),
        ],
      },
      {
        id: "inst_other",
        title: "Anything else",
        fields: [],
        slots: [slot({ id: "inst_other", label: "Other install photos", hint: "Anything worth keeping — add a note", required: false, max: 20, guide: "wide" })],
      },
    ],
  },
  {
    id: "final_inspection",
    number: 2,
    title: "Final — pre-inspection & commissioning",
    short: "Final",
    evidence: "final_inspection",
    sections: [
      {
        id: "fin_labels",
        title: "Labels & placards",
        fields: [],
        slots: [
          slot({ id: "fin_placard", label: "Main placard", hint: "Placard at the meter or MSP, readable", required: true, max: 2, guide: "label" }),
          slot({ id: "fin_labels_disc", label: "Disconnect labels", hint: "Every sticker on the disconnect", required: true, max: 2, guide: "label" }),
          slot({ id: "fin_labels_combiner", label: "Combiner / gateway labels", hint: "Stickers on the combiner or Envoy", required: true, max: 2, guide: "label" }),
          slot({ id: "fin_labels_conduit", label: "Conduit labels", hint: "Raceway labels every 10 ft", required: false, max: 3, guide: "label" }),
        ],
      },
      {
        id: "fin_array",
        title: "Array, finished",
        fields: [
          { id: "tilt_deg", label: "Tilt on inclinometer", kind: "number", unit: "°", keyboard: "decimal-pad", min: 0, max: 90 },
          { id: "max_cantilever_in", label: "Largest rail cantilever", kind: "number", unit: "in", keyboard: "decimal-pad", min: 0, max: 60 },
        ],
        slots: [
          slot({ id: "fin_inclinometer", label: "Inclinometer reading", hint: "Inclinometer on a panel, reading visible", required: true, max: 2, guide: "pitch_gauge" }),
          slot({ id: "fin_cantilever", label: "Rail cantilevers", hint: "Tape from last foot to rail end — note the inches", required: true, max: 8, guide: "material" }),
          slot({ id: "fin_under_panel", label: "Under-panel wiring", hint: "Wire management under the modules", required: true, max: 4, guide: "roof_plane" }),
          slot({ id: "fin_rail_ends", label: "Rail ends trimmed", hint: "Panel edge and rail end after cutting", required: false, max: 4, guide: "roof_plane" }),
          slot({ id: "fin_array_ground", label: "Finished array from the ground", hint: "Every array face, from the yard", required: true, max: 4, guide: "wide" }),
        ],
      },
      {
        id: "fin_commission",
        title: "Commissioning",
        fields: [{ id: "commissioned", label: "System commissioned and producing?", kind: "yesno", required: true }],
        slots: [
          slot({ id: "fin_production", label: "Production screen", hint: "App screenshot showing the system producing", required: true, max: 2, guide: "label" }),
          slot({ id: "fin_ct_data", label: "CT / consumption data", hint: "Screenshot of CT readings", required: true, max: 2, guide: "label" }),
          slot({ id: "fin_commission", label: "Commissioning confirmation", hint: "Commission / proof-of-completion screens", required: true, max: 4, guide: "label" }),
          slot({ id: "fin_compliance", label: "Compliance documents", hint: "e.g. FEOC compliance, equipment certs", required: false, max: 4, guide: "label" }),
        ],
      },
      {
        id: "fin_site",
        title: "Site & cleanup",
        fields: [],
        slots: [
          slot({ id: "fin_equipment_final", label: "Equipment wall, finished", hint: "Everything closed, labelled and strapped", required: true, max: 2, guide: "wide" }),
          slot({ id: "fin_house_final", label: "Front of house, finished", hint: "The finished job from the street", required: false, max: 2, guide: "house_front" }),
          slot({ id: "fin_other", label: "Other final photos", hint: "Anything worth keeping — add a note", required: false, max: 20, guide: "wide" }),
        ],
      },
    ],
  },
];

