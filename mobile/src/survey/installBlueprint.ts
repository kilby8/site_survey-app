// ============================================================
// Install & final photos — what the crew documents on install day and
// at the final / pre-inspection visit. Built from Under The Sun's real
// CompanyCam reports (Andrew Lindsey job): every shot the crew took there
// is a named slot here, so captions are consistent and nothing is missed.
//
// Ids must never change once shipped (photos and answers are stored by id).
// Slot ids start with "inst_" (install day) or "fin_" (final).
// ============================================================

import type { SectionDef, SlotDef, StepDef } from "./blueprint";

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


// ============================================================
// Install checklist v2 — one checklist per job type (James, 2026-10-22).
//
// Built from Under the Sun's CompanyCam templates that Ray's Claude posted in
// #all-claude on 2026-10-22: "UTS Install – SOLAR ONLY / SOLAR + BATTERY
// (Enphase / Tesla) – LightReach + Solrite ready". Every rule cites its source
// so one photo set satisfies either financier:
//   [LR …] Palmetto LightReach "Solar Energy Plan: Install (M1) Photo
//          Documentation" (sections PS / R / E / ES / PC) and the Illinois
//          incentive deliverables (IL M1);
//   [SR …] Solrite SE-0004 M1 installation photos.
// Items marked "IF" are conditional and never required, as in the templates.
//
// New jobs get this checklist (doc.installChecklist = 2). Jobs started on the
// earlier checklist keep INSTALL_STEPS above, so none of their photos move.
// Ids here are new and, like every id, must never change once shipped.
// ============================================================

export const JOB_TYPES = [
  "Solar only",
  "Solar + Battery",
  "Solrite – Solar + Battery",
  "Solrite – Battery only",
  "Battery only",
  "Solar R&R",
  "Service call",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
/**
 * Job types the crew can pick today. Battery only, R&R and Service join this list
 * when their checklists are built, so nobody opens an empty checklist in the field.
 */
export const OFFERED_JOB_TYPES: JobType[] = ["Solar only", "Solar + Battery", "Solrite – Solar + Battery", "Solrite – Battery only"];

const SOLAR_JOBS: JobType[] = ["Solar only", "Solar + Battery"];
const SOLRITE_PV: JobType = "Solrite – Solar + Battery";
const SOLRITE_BATT: JobType = "Solrite – Battery only";
const SOLRITE_JOBS: JobType[] = [SOLRITE_PV, SOLRITE_BATT];
const onlyFor = (...types: JobType[]) => ({ field: "job_type", oneOf: types });

const v2 = (s: Omit<SlotDef, "requirementId" | "usage"> & { req: string }): SlotDef => ({
  ...s,
  hint: `${s.hint} [${s.req}]`,
  requirementId: s.req,
  usage: [...I],
});

// ------------------------------------------------------------
// Solrite (Duracell Max Hybrid) — Ray's CompanyCam templates, read 2026-10-23:
//   "Solrite M1 Photos – Solar + Battery (Duracell MA PV + Duracell Max Hybrid)"
//     3b3072da…, SE-0004-05, 42 items;
//   "Solrite M1 Photos – Battery Only (Duracell Max Hybrid)" bf13eaab…,
//     SE-0004-07 battery lease, 31 items.
// Item numbers are Solrite's and go in the tag ([SR 4.5-3]). Items the template
// itself calls conditional (shading, E-STOP "if applicable", existing array) are
// "IF" here and never required; the protected load panel photos show (and are
// required) only on load-side backup. The network items (5.10a–d)
// are done at commissioning, so they sit in the Final step.
// ------------------------------------------------------------
const PV_ONLY = { field: "job_type", equals: SOLRITE_PV };
const BATT_ONLY = { field: "job_type", equals: SOLRITE_BATT };
const LOAD_SIDE = { field: "backup_type", equals: "Partial home (load side)" };

const SOLRITE_INSTALL_SECTIONS: SectionDef[] = [
  {
    id: "sr_general",
    title: "Solrite · General",
    showIf: onlyFor(...SOLRITE_JOBS),
    fields: [],
    slots: [
      v2({ id: "sr_front_address", label: "Front of house + street address", hint: "Take this FIRST — it marks the start of the job", req: "SR 1.1", required: true, max: 2, guide: "house_front" }),
      v2({ id: "sr_shading", label: "IF: shading fixed — before AND after", hint: "Trees trimmed etc.; won't fit in one frame: 180° pano left to right", req: "SR 1.2", required: false, max: 6, guide: "shade", showIf: PV_ONLY }),
      v2({ id: "sr_equipment_wall", label: "Equipment on wall", hint: "MSP, monitoring, disconnects and conduit in one shot. Not within 36\" of gas, not in HVAC enclosures, BESS ventilated", req: "SR 1.3", required: true, max: 3, guide: "wide" }),
    ],
  },
  {
    id: "sr_roof",
    title: "Solrite · Roof PV array & structure",
    showIf: onlyFor(SOLRITE_PV),
    fields: [],
    slots: [
      v2({ id: "sr_racking", label: "Racking assembly, each (before modules)", hint: "Rail, attachment and flashing on EACH assembly before modules; manufacturer torque specs", req: "SR 2.1", required: true, max: 8, guide: "material" }),
      v2({ id: "sr_conduit_run", label: "Conduit run, incl. attic", hint: "Every transition and connection along the whole run, attic too", req: "SR 2.2", required: true, max: 8, guide: "attic" }),
      v2({ id: "sr_penetration", label: "Roof penetration + waterproofing close-up", hint: "The penetration, then a close-up of how it's sealed", req: "SR 2.3", required: true, max: 3, guide: "material" }),
      v2({ id: "sr_jbox", label: "Every J-box open", hint: "Splices and grounding visible; weep hole ≤1/4\" at the low point; NO wire nuts on ground (NEC 250.8)", req: "SR 2.4", required: true, max: 6, guide: "label" }),
      v2({ id: "sr_module_label", label: "Module label (back of one module)", hint: "Part number and electrical specs readable", req: "SR 2.5", required: true, max: 1, guide: "label" }),
      v2({ id: "sr_array_each", label: "Each array, complete", hint: "The whole installed array; flat roofs: 18\" min in-row spacing visible", req: "SR 2.6", required: true, max: 6, guide: "wide" }),
      v2({ id: "sr_tilt", label: "Tilt measurement, each array", hint: "Measured ON the array with the modules in the shot", req: "SR 2.7", required: true, max: 6, guide: "pitch_gauge" }),
      v2({ id: "sr_wire_mgmt", label: "Wire management under array, each roof", hint: "Clear line of sight under the array; no wire touching the roof", req: "SR 2.8", required: true, max: 6, guide: "roof_plane" }),
      v2({ id: "sr_rack_ground", label: "Rack grounding method", hint: "Clear shot of how the rack is grounded", req: "SR 2.9", required: true, max: 3, guide: "label" }),
      v2({ id: "sr_micro_map", label: "Micro layout map w/ serials + inverter model", hint: "Map with serials (checked against Duracell Power Center) plus the micro and its model. M Series: NC0154 single / NC0142 dual", req: "SR 2.10", required: true, max: 4, guide: "label" }),
    ],
  },
  {
    id: "sr_existing_pv",
    title: "Solrite · Existing solar",
    showIf: onlyFor(SOLRITE_BATT),
    fields: [{ id: "sr_has_pv", label: "Home already has solar?", kind: "yesno", required: true }],
    slots: [
      v2({ id: "sr_existing_array", label: "IF existing solar: each array, complete", hint: "Only if the home already has PV — every array, whole system in frame", req: "SR 2.6", required: false, max: 6, guide: "wide", showIf: { field: "sr_has_pv", equals: true } }),
    ],
  },
  {
    id: "sr_ac",
    title: "Solrite · AC ground equipment",
    showIf: onlyFor(...SOLRITE_JOBS),
    fields: [],
    slots: [
      v2({ id: "sr_gateway_open", label: "Gateway cover open — Ethernet + AC wiring (1 of 3)", hint: "HARDWIRED Ethernet only (remove TP-Link + BOOSTER); upright, conduit from the bottom. Meters: production FF000002 first, then consumption FF000001", req: "SR 3.1a", required: true, max: 2, guide: "panel_open", showIf: PV_ONLY }),
      v2({ id: "sr_gateway_open_batt", label: "Gateway cover open — Ethernet + AC wiring (1 of 3)", hint: "HARDWIRED Ethernet only (remove TP-Link + BOOSTER); upright, conduit from the bottom. Battery only: enter ONLY consumption meter FF000001", req: "SR 3.1a", required: true, max: 2, guide: "panel_open", showIf: BATT_ONLY }),
      v2({ id: "sr_gateway_serial", label: "Gateway serial (top-right of display) (2 of 3)", hint: "Serial number at the top-right of the gateway screen", req: "SR 3.1b", required: true, max: 1, guide: "label" }),
      v2({ id: "sr_gateway_part", label: "Gateway enclosure part-number label (3 of 3)", hint: "Part number label on the gateway box", req: "SR 3.1c", required: true, max: 1, guide: "label" }),
      v2({ id: "sr_main_disconnect", label: "Main service disconnect + label", hint: "Label with the fuse/breaker rating readable, plus all the wiring", req: "SR 3.2a", required: true, max: 3, guide: "panel_open" }),
      v2({ id: "sr_estop_pv", label: "IF: E-STOP wiring + label", hint: "If there is one: wiring in full and the inside label with PART NUMBER", req: "SR 3.2b", required: false, max: 2, guide: "label", showIf: PV_ONLY }),
      v2({ id: "sr_estop_batt", label: "E-STOP wiring + label", hint: "Wiring in full and the inside label with PART NUMBER", req: "SR 3.2b", required: true, max: 2, guide: "label", showIf: BATT_ONLY }),
      v2({ id: "sr_ac_disconnects", label: "All AC disconnects + labels", hint: "Every disconnect with wiring; one label photo if all ratings match, else one each", req: "SR 3.2c", required: true, max: 6, guide: "panel_open" }),
    ],
  },
  {
    id: "sr_interconnect",
    title: "Solrite · Interconnection",
    showIf: onlyFor(...SOLRITE_JOBS),
    fields: [],
    slots: [
      v2({ id: "sr_msp_open", label: "MSP, main cover open", hint: "Main breaker and its rating visible; close-up if needed", req: "SR 4.1", required: true, max: 3, guide: "panel_open" }),
      v2({ id: "sr_msp_label", label: "MSP label (busbar rating / part #)", hint: "Busbar rating or part number; no label → photo the door where it should be", req: "SR 4.2", required: true, max: 2, guide: "label" }),
      v2({ id: "sr_dead_front", label: "MSP dead front off", hint: "After the non-essential load panel and gateway breakers are in; all wiring visible", req: "SR 4.3", required: true, max: 2, guide: "panel_open", showIf: PV_ONLY }),
      v2({ id: "sr_dead_front_batt", label: "MSP dead front off — no G-N bond on protected loads", hint: "All wiring visible; show there is NO ground-neutral bond on the protected load circuit", req: "SR 4.3", required: true, max: 2, guide: "panel_open", showIf: BATT_ONLY }),
      v2({ id: "sr_pv_combiner", label: "PV combiner panel(s) — breakers + label", hint: "Every combiner open, all breakers labelled, amp rating label readable", req: "SR 4.4", required: true, max: 4, guide: "panel_open", showIf: PV_ONLY }),
      v2({ id: "sr_mh_front", label: "Max Hybrid — front", hint: "The Max Hybrid as installed, from the front", req: "SR 4.5-1", required: true, max: 1, guide: "wide" }),
      v2({ id: "sr_mh_inside", label: "Max Hybrid — inside", hint: "Cover off", req: "SR 4.5-2", required: true, max: 2, guide: "panel_open" }),
      v2({ id: "sr_mh_dc_wiring", label: "Internal DC wiring", hint: "DC busbars, cable routing, terminations — every conductor connection visible", req: "SR 4.5-3", required: true, max: 3, guide: "panel_open" }),
      v2({ id: "sr_gutter", label: "Gutter box + busbar interior, open", hint: "Gutter box grounded, every entrance sealed; stack grounds in the same conduit as the DC run", req: "SR 4.5-4", required: true, max: 3, guide: "panel_open" }),
      v2({ id: "sr_plp_open", label: "Protected load panel open (load side)", hint: "Every breaker in the protected load panel", req: "SR 4.5-5", required: true, max: 2, guide: "subpanel", showIf: LOAD_SIDE }),
      v2({ id: "sr_plp_label", label: "Protected load panel ratings (load side)", hint: "Busbar rating label and main breaker rating readable", req: "SR 4.5-6", required: true, max: 2, guide: "label", showIf: LOAD_SIDE }),
      v2({ id: "sr_dura5_dc", label: "Dura 5 DC wiring", hint: "DC wiring leaves the battery stacks ONLY through the designated cable exits", req: "SR 4.5-7", required: true, max: 3, guide: "material" }),
      v2({ id: "sr_stack_ground", label: "Stack grounding daisy-chain", hint: "Continuous ground stack to stack, last one landing on the inverter ground bar", req: "SR 4.5-8", required: true, max: 3, guide: "material" }),
    ],
  },
  {
    id: "sr_battery",
    title: "Solrite · Battery (Duracell Max Hybrid)",
    showIf: onlyFor(...SOLRITE_JOBS),
    fields: [],
    slots: [
      v2({ id: "sr_layout", label: "Battery layout + clearances", hint: "All equipment and its surroundings, gaps between batteries visible", req: "SR 5.1", required: true, max: 3, guide: "wide" }),
      v2({ id: "sr_mh_serial", label: "Max Hybrid serial label", hint: "On the side panel of the power unit", req: "SR 5.2a", required: true, max: 1, guide: "label" }),
      v2({ id: "sr_dongle", label: "Comms dongle — hardwired", hint: "Must be hardwired; wireless is rejected", req: "SR 5.2b", required: true, max: 1, guide: "material" }),
      v2({ id: "sr_cts", label: "Storage CTs + orientation", hint: "Gateway consumption CTs on EVERY job. Whole home: service side upstream of the Max Hybrid. Load side: 2× white 300 A at the MSP. RGM PV CT always", req: "SR 5.3", required: true, max: 3, guide: "panel_open", showIf: PV_ONLY }),
      v2({ id: "sr_cts_batt", label: "Storage CTs + orientation", hint: "Gateway consumption CTs on EVERY job. Whole home: service side upstream of the Max Hybrid. Load side: 2× white 300 A at the MSP. No PV CT on battery only", req: "SR 5.3", required: true, max: 3, guide: "panel_open", showIf: BATT_ONLY }),
      v2({ id: "sr_mounting", label: "Mounting / anchoring", hint: "Towers into WALL STUDS — or unistrut, a 500 lb+ drillable pad, or a plinth anchored to the floor", req: "SR 5.5", required: true, max: 3, guide: "material" }),
      v2({ id: "sr_grid_dc", label: "Grid, MicroGrid + DC connections (cover off)", hint: "One sharp, well-lit shot with every termination", req: "SR 5.8", required: true, max: 2, guide: "panel_open" }),
      v2({ id: "sr_bms", label: "BMS connections, ALL stacks", hint: "BMS per the manual on every battery in every stack", req: "SR 5.9", required: true, max: 4, guide: "material" }),
    ],
  },
];

const SOLRITE_FINAL_SECTIONS: SectionDef[] = [
  {
    id: "sr_network",
    title: "Solrite · Network",
    showIf: onlyFor(...SOLRITE_JOBS),
    fields: [],
    slots: [
      v2({ id: "sr_net_setup", label: "PC-PRO-WL on switch + router", hint: "Connected to the Ethernet switch and the router", req: "SR 5.10a", required: true, max: 2, guide: "material" }),
      v2({ id: "sr_net_host", label: "HOST device label", hint: "Model readable", req: "SR 5.10b", required: true, max: 1, guide: "label" }),
      v2({ id: "sr_net_client", label: "CLIENT device label + placement", hint: "Model readable; on a flat surface indoors, not wall-mounted or in an enclosure", req: "SR 5.10c", required: true, max: 2, guide: "label" }),
      v2({ id: "sr_net_stickers", label: "WiFi + Admin password stickers", hint: "Photo them, then THROW THEM AWAY — none left at the customer's", req: "SR 5.10d", required: true, max: 1, guide: "label" }),
    ],
  },
];

export const INSTALL_V2_STEPS: StepDef[] = [
  {
    id: "install_day",
    number: 1,
    title: "Install day — site, roof & electrical",
    short: "Install day",
    evidence: "install_day",
    sections: [
      {
        id: "v2_job",
        title: "Job type",
        fields: [
          { id: "job_type", label: "Job type", kind: "choice", required: true, options: [...OFFERED_JOB_TYPES], help: "Loads the photo checklist for this kind of job. Anyone on the crew can set it. Solrite jobs (Duracell Max Hybrid) have their own list. UTS battery only, R&R and Service jobs: use CompanyCam for now." },
          { id: "equipment_brand", label: "Equipment", kind: "choice", required: true, options: ["Enphase", "Tesla"], showIf: onlyFor(...SOLAR_JOBS) },
          { id: "financier", label: "Financing", kind: "choice", options: ["LightReach", "Solrite", "Cash / other"], showIf: onlyFor(...SOLAR_JOBS) },
          { id: "backup_type", label: "Backup", kind: "choice", required: true, options: ["Whole home (supply side)", "Partial home (load side)"], help: "Partial home adds the protected load panel photos.", showIf: onlyFor(...SOLRITE_JOBS) },
        ],
        slots: [],
      },
      {
        id: "uts_arrival",
        title: "Site arrival & existing conditions",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_front_address", label: "Front of home + address", hint: "Shoot first: the whole front with the house number readable", req: "LR PS1 · SR 1.1", required: true, max: 2, guide: "house_front" }),
          v2({ id: "uts_roof_before", label: "Roof / work area before work", hint: "Condition before anything is touched, plus any repair", req: "LR PS2", required: true, max: 6, guide: "roof_plane" }),
          v2({ id: "uts_service_before", label: "Existing service before work", hint: "Main panel and service as found; any code issue or outdated equipment", req: "LR PS3", required: true, max: 4, guide: "panel_open" }),
          v2({ id: "uts_tree_removal", label: "IF: shading / tree removal", hint: "The whole tree before it comes down", req: "LR SI3 · SR 1.2", required: false, max: 4, guide: "shade" }),
          v2({ id: "uts_accessory_structure", label: "IF: accessory structure framing + foundation", hint: "Framing and foundation of a garage, shed or carport array", req: "LR PS1", required: false, max: 4, guide: "foundation" }),
        ],
      },
      {
        id: "uts_equipment",
        title: "Equipment ID",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_module_label", label: "Module label", hint: "Manufacturer label on a module, model and ratings readable", req: "LR PS4 · SR 2.5", required: true, max: 2, guide: "label" }),
          v2({ id: "uts_module_serials", label: "Module serials as installed", hint: "Serials on the modules actually installed; no stock photos", req: "LR PS4", required: true, max: 10, guide: "label" }),
          v2({ id: "uts_inverter_label", label: "Inverter / micro model + serial", hint: "Label with model and serial readable", req: "LR PS5", required: true, max: 3, guide: "label" }),
          v2({ id: "uts_gateway_label", label: "Combiner / gateway labels + serials", hint: "Every label and serial; mandatory in Illinois", req: "LR PS6", required: true, max: 3, guide: "label" }),
          v2({ id: "uts_feoc", label: "IF: domestic-content / FEOC parts", hint: "Labels of the parts claimed for domestic content or FEOC", req: "LR PS9", required: false, max: 6, guide: "label" }),
        ],
      },
      {
        id: "uts_roof",
        title: "Roof in progress (before modules)",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_attachments", label: "Attachments: flashing + sealant", hint: "Flashing and sealant at the attachments; approved (AVL) parts only", req: "LR R1", required: true, max: 6, guide: "material" }),
          v2({ id: "uts_penetration", label: "Penetration / roof exit waterproofing", hint: "Close-up of the roof exit, sealed", req: "SR 2.3 · LR R8", required: true, max: 3, guide: "material" }),
          v2({ id: "uts_plane_pullback", label: "Each plane, pulled back", hint: "Every plane before modules: rails, MLPE, wire management and EGC in one shot", req: "LR R2", required: true, max: 6, guide: "roof_plane" }),
          v2({ id: "uts_egc_path", label: "EGC path, every array", hint: "The equipment ground from array to array and off the roof", req: "LR R3", required: true, max: 4, guide: "label" }),
          v2({ id: "uts_tesla_mci", label: "IF Tesla: MCIs + diode test", hint: "MCIs in place and the diode test result", req: "LR PS7", required: false, max: 4, guide: "material", showIf: { field: "equipment_brand", equals: "Tesla" } }),
        ],
      },
      {
        id: "uts_arrays",
        title: "Finished arrays",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_array_each", label: "Each array, every module countable", hint: "One shot per array; every module countable, rail ends trimmed", req: "LR R4", required: true, max: 6, guide: "wide" }),
          v2({ id: "uts_tilt", label: "Tilt on a module (5–45°)", hint: "Inclinometer on a module, reading visible; one per roof pitch", req: "LR R5", required: true, max: 4, guide: "pitch_gauge" }),
          v2({ id: "uts_wire_mgmt", label: "Wire management under each array", hint: "Under the modules with MLPE; nothing resting on the roof", req: "LR R6", required: true, max: 6, guide: "roof_plane" }),
          v2({ id: "uts_jbox_open", label: "Every J-box open", hint: "≤2\" of exposed conductor, weep hole, no wire nuts on the ground", req: "LR R7", required: true, max: 4, guide: "label" }),
          v2({ id: "uts_conduit_path", label: "Conduit path, including the attic", hint: "The whole run from the roof to the equipment", req: "LR R8", required: true, max: 6, guide: "attic" }),
          v2({ id: "uts_device_map", label: "Micro map (Enphase) or string map (Tesla)", hint: "Enphase: the map with every micro serial. Tesla: the string map with MCIs", req: "LR PS7 / PS8", required: true, max: 4, guide: "label" }),
        ],
      },
      {
        id: "uts_electrical",
        title: "Electrical & interconnection",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_bos_pullback", label: "Balance of system, pulled back", hint: "All new equipment in one wide shot", req: "LR E5", required: true, max: 3, guide: "wide" }),
          v2({ id: "uts_combiner_interior", label: "Combiner or inverter interior", hint: "Enphase: IQ Combiner inside with the production CT phase. Tesla: inverter strings, feeders, RGM and grounding", req: "LR E1", required: true, max: 4, guide: "panel_open" }),
          v2({ id: "uts_poi", label: "Point of interconnection", hint: "Pulled back, then close-ups of the tie-in", req: "LR E2", required: true, max: 4, guide: "breaker" }),
          v2({ id: "uts_main_breaker", label: "Main breaker rating", hint: "The main breaker's rating readable", req: "LR E3", required: true, max: 2, guide: "breaker" }),
          v2({ id: "uts_busbar_label", label: "Main panel busbar label", hint: "Busbar rating label (or the electrician's letter if there's none)", req: "LR E4", required: true, max: 2, guide: "label" }),
          v2({ id: "uts_dead_front_off", label: "Main panel, dead front off", hint: "Inside the main panel after the tie-in", req: "SR 4.3", required: true, max: 2, guide: "panel_open" }),
          v2({ id: "uts_consumption_cts", label: "Consumption CTs on the service feeders", hint: "CTs on the feeders with the arrow direction visible", req: "LR E7", required: true, max: 3, guide: "panel_open" }),
          v2({ id: "uts_disconnects", label: "Disconnects, inside + ratings", hint: "Each disconnect open with its rating; neutral-ground bonded once only", req: "LR E10", required: true, max: 4, guide: "panel_open" }),
          v2({ id: "uts_raceways", label: "Conduit / raceways", hint: "All raceways; Enphase multi-system: 1 m separation + powerline filter", req: "LR E6", required: true, max: 4, guide: "wide" }),
          v2({ id: "uts_labels", label: "Labels & placards", hint: "Every required label and the placard, readable", req: "AHJ", required: true, max: 6, guide: "label" }),
          v2({ id: "uts_tap", label: "IF: line / load-side tap or IPC", hint: "The tap or IPC connection", req: "LR E8", required: false, max: 3, guide: "panel_open" }),
          v2({ id: "uts_meter_collar", label: "IF: meter collar", hint: "The collar installed at the meter", req: "LR E9", required: false, max: 2, guide: "meter_close" }),
          v2({ id: "uts_subpanel", label: "IF: subpanel", hint: "Subpanel open, with its label", req: "LR ES6", required: false, max: 3, guide: "subpanel", showIf: { field: "job_type", equals: "Solar only" } }),
        ],
      },
      {
        id: "uts_battery",
        title: "Battery",
        showIf: onlyFor("Solar + Battery"),
        fields: [],
        slots: [
          v2({ id: "uts_battery_label", label: "Battery label + serial, every unit", hint: "One label per battery, serial readable", req: "LR ES1", required: true, max: 6, guide: "label" }),
          v2({ id: "uts_battery_wiring", label: "Battery wiring / cabinet", hint: "Comm wire both ends, drain on one end. Enphase: CTRL-SC3-NA-01 only. Powerwall 3: ferrite + drain", req: "LR ES2", required: true, max: 6, guide: "panel_open" }),
          v2({ id: "uts_battery_location", label: "Battery location, pulled back", hint: "Cover off; clearances, bollards and sun exposure visible", req: "LR ES4", required: true, max: 3, guide: "wide" }),
          v2({ id: "uts_battery_mounting", label: "Battery mounting", hint: "Mounting hardware into the structure", req: "SR 5.5", required: true, max: 3, guide: "material" }),
          v2({ id: "uts_backup_controller", label: "System Controller / Backup Switch + internals", hint: "Enphase IQ System Controller 3 or meter collar; Tesla Backup Switch or Gateway — label and inside", req: "LR ES5 / E10", required: true, max: 4, guide: "panel_open" }),
          v2({ id: "uts_5p_cts", label: "IF Enphase 5P: battery CTs on L2", hint: "The battery CTs on L2", req: "LR ES3", required: false, max: 2, guide: "panel_open", showIf: { field: "equipment_brand", equals: "Enphase" } }),
          v2({ id: "uts_tesla_rem", label: "IF Tesla: Remote Energy Meter + TRM antenna", hint: "The meter and its antenna", req: "LR E1", required: false, max: 2, guide: "label", showIf: { field: "equipment_brand", equals: "Tesla" } }),
          v2({ id: "uts_backup_loads", label: "IF: backup loads / sub panel", hint: "Backup loads panel open, with its label", req: "LR ES6", required: false, max: 3, guide: "subpanel" }),
        ],
      },
      ...SOLRITE_INSTALL_SECTIONS,
    ],
  },
  {
    id: "final_inspection",
    number: 2,
    title: "Final — commissioning & completion",
    short: "Final",
    evidence: "final_inspection",
    sections: [
      {
        id: "uts_commissioning",
        title: "Commissioning & Illinois Shines",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_commissioned", label: "Commissioning complete, on cellular", hint: "Enphase: micros mapped, CTs reading. Tesla One: \"Palmetto LightReach\" partner added, CTs, cellular, MPPT, PCS / panel current limit", req: "LR PC", required: true, max: 6, guide: "label" }),
          v2({ id: "uts_battery_reserve", label: "Battery reserve + healthy state", hint: "Tesla: ≥20% reserve and Storm Watch on. Enphase: reserve set. Battery healthy", req: "LR SC1", required: true, max: 3, guide: "label", showIf: { field: "job_type", equals: "Solar + Battery" } }),
          v2({ id: "uts_il_smart_inverter", label: "Illinois smart-inverter screenshots", hint: "Enphase: Grid Profile report + Gateway + micro info. Tesla: Volt-Var + Grid Code. Must match the Ameren DER rebate application", req: "IL M1", required: true, max: 6, guide: "label" }),
          v2({ id: "uts_revenue_meter", label: "Revenue-grade production meter", hint: "The production meter, ANSI C12.1 marking visible", req: "IL M1", required: true, max: 2, guide: "meter_close" }),
        ],
      },
      {
        id: "uts_completion",
        title: "Site completion",
        showIf: onlyFor(...SOLAR_JOBS),
        fields: [],
        slots: [
          v2({ id: "uts_cleanup", label: "Clean-up / final walk", hint: "Site cleaned; the finished job from the yard", req: "LR SI", required: true, max: 4, guide: "wide" }),
          v2({ id: "uts_trenching", label: "IF: trenching (NEC 300.5)", hint: "Open trench with depth on a tape, before backfill", req: "LR SI2", required: false, max: 4, guide: "trench" }),
          v2({ id: "uts_mpu", label: "IF: main panel upgrade / electrical adder", hint: "The upgraded equipment, for the M2 adder", req: "LR SI1", required: false, max: 4, guide: "panel_open" }),
        ],
      },
      ...SOLRITE_FINAL_SECTIONS,
    ],
  },
];
