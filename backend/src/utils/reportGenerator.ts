/**
 * backend/src/utils/reportGenerator.ts
 *
 * Pure-function engineering assessment generator.
 *
 * Takes the full survey record (with checklist and metadata) and produces
 * an `EngineeringReport` JSON object that flags design-critical conditions
 * for the design team.
 *
 * Automated High-Priority red-flag rules:
 *  - Roof Mount  : roof_age_years > 15            → structural loading risk
 *  - Roof Mount  : roof_material === 'Membrane'   → water-ingress / attachment risk
 *  - Ground Mount: soil_type    === 'Rocky'       → specialist pier equipment required
 *  - Solar Fencing: lower_shade_risk === true     → affects string sizing / production
 *  - Electrical  : checklist item "Main Service Panel" with status 'fail'
 */

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type FlagPriority = 'High' | 'Medium' | 'Low';
export type OverallRisk  = 'High' | 'Medium' | 'Low' | 'None';

export interface ReportFlag {
  priority:    FlagPriority;
  category:    string;
  field?:      string;
  message:     string;
}

export interface ChecklistSummary {
  total:   number;
  pass:    number;
  fail:    number;
  na:      number;
  pending: number;
}

export interface EngineeringReport {
  survey_id:         string;
  project_name:      string;
  site_name:         string;
  site_address:      string | null;
  inspector_name:    string;
  category:          string | null;
  latitude:          number | null;
  longitude:         number | null;
  survey_date:       string;
  generated_at:      string;
  overall_risk:      OverallRisk;
  flags:             ReportFlag[];
  checklist_summary: ChecklistSummary;
  recommendations:   string[];
  metadata:          Record<string, unknown> | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal metadata shapes (mirrors the shared types)
// ──────────────────────────────────────────────────────────────────────────────

interface GroundMountMeta {
  type:                'ground_mount';
  soil_type?:          string | null;
  slope_degrees?:      number | null;
  trenching_path?:     string;
  vegetation_clearing?: boolean;
}

interface RoofMountMeta {
  type:            'roof_mount';
  roof_material?:  string | null;
  rafter_size?:    string | null;
  rafter_spacing?: string | null;
  roof_age_years?: number | null;
  azimuth?:        number | null;
}

interface SolarFencingMeta {
  type:                'solar_fencing';
  perimeter_length_ft?: number | null;
  lower_shade_risk?:   boolean;
  foundation_type?:    string | null;
  bifacial_surface?:   string | null;
}

type SurveyMeta = GroundMountMeta | RoofMountMeta | SolarFencingMeta;

interface ChecklistRow {
  label:  string;
  status: string;
  notes?: string;
}

interface SurveyInput {
  id:             string;
  project_name:   string;
  site_name:      string;
  site_address?:  string | null;
  inspector_name: string;
  category_name?: string | null;
  latitude?:      number | null;
  longitude?:     number | null;
  survey_date:    string;
  metadata?:      unknown;
  checklist?:     ChecklistRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Red-flag evaluators
// ──────────────────────────────────────────────────────────────────────────────

function evaluateRoofMount(meta: RoofMountMeta): ReportFlag[] {
  const flags: ReportFlag[] = [];

  if (meta.roof_age_years != null && meta.roof_age_years > 15) {
    flags.push({
      priority: 'High',
      category: 'Roof Mount',
      field:    'roof_age_years',
      message:  `Roof age is ${meta.roof_age_years} years (>15). ` +
                'A full structural loading assessment is required before mounting.',
    });
  }

  if (meta.roof_material === 'Membrane') {
    flags.push({
      priority: 'High',
      category: 'Roof Mount',
      field:    'roof_material',
      message:  'Membrane roofing detected — high risk of water ingress at penetration points. ' +
                'Specialist membrane-compatible mounting hardware and a certified roofer are required.',
    });
  }

  return flags;
}

function evaluateGroundMount(meta: GroundMountMeta): ReportFlag[] {
  const flags: ReportFlag[] = [];

  if (meta.soil_type === 'Rocky') {
    flags.push({
      priority: 'High',
      category: 'Ground Mount',
      field:    'soil_type',
      message:  'Rocky soil identified — standard helical piers cannot be used. ' +
                'Specialist pier-boring or ballasted racking equipment is required.',
    });
  }

  return flags;
}

function evaluateSolarFencing(meta: SolarFencingMeta): ReportFlag[] {
  const flags: ReportFlag[] = [];

  if (meta.lower_shade_risk === true) {
    flags.push({
      priority: 'High',
      category: 'Solar Fencing',
      field:    'lower_shade_risk',
      message:  'Low-lying obstructions present — shade impact must be modelled at design stage. ' +
                'String sizing and production estimates will be affected.',
    });
  }

  return flags;
}

function evaluateChecklist(checklist: ChecklistRow[]): ReportFlag[] {
  const flags: ReportFlag[] = [];

  for (const item of checklist) {
    if (
      item.label.toLowerCase().includes('main service panel') &&
      item.status === 'fail'
    ) {
      flags.push({
        priority: 'High',
        category: 'Electrical',
        field:    'checklist:Main Service Panel',
        message:  'Main Service Panel failed inspection — panel upgrade or replacement is required ' +
                  'before grid-tie connection can be approved.',
      });
    }
  }

  return flags;
}

// ──────────────────────────────────────────────────────────────────────────────
// Checklist summary
// ──────────────────────────────────────────────────────────────────────────────

function summariseChecklist(checklist: ChecklistRow[]): ChecklistSummary {
  const summary: ChecklistSummary = { total: checklist.length, pass: 0, fail: 0, na: 0, pending: 0 };
  for (const item of checklist) {
    const s = item.status as keyof Omit<ChecklistSummary, 'total'>;
    if (s in summary) (summary[s] as number) += 1;
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────────────────────
// Recommendations
// ──────────────────────────────────────────────────────────────────────────────

function buildRecommendations(flags: ReportFlag[], summary: ChecklistSummary): string[] {
  const recs: string[] = [];

  const highFlags = flags.filter((f) => f.priority === 'High');

  for (const flag of highFlags) {
    switch (flag.field) {
      case 'roof_age_years':
        recs.push("Commission a structural engineer's report before any roof penetration work.");
        break;
      case 'roof_material':
        recs.push('Engage a certified roofing contractor to specify watertight membrane flashings.');
        break;
      case 'soil_type':
        recs.push('Update civil engineering drawings to specify ground-screw or micro-pile foundations.');
        break;
      case 'lower_shade_risk':
        recs.push('Run a PVsyst or equivalent shade analysis; adjust string configuration accordingly.');
        break;
      case 'checklist:Main Service Panel':
        recs.push('Schedule MSP upgrade with a licensed electrician before interconnection application.');
        break;
    }
  }

  if (summary.fail > 0 && !highFlags.some((f) => f.field === 'checklist:Main Service Panel')) {
    recs.push(
      `${summary.fail} checklist item(s) marked FAIL — review and resolve before design sign-off.`
    );
  }

  if (summary.pending > 0) {
    recs.push(
      `${summary.pending} checklist item(s) still pending — complete the site survey before finalising the design.`
    );
  }

  if (recs.length === 0) {
    recs.push('No critical issues identified. Proceed with standard design workflow.');
  }

  return recs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Overall risk rating
// ──────────────────────────────────────────────────────────────────────────────

function calcOverallRisk(flags: ReportFlag[]): OverallRisk {
  if (flags.some((f) => f.priority === 'High'))   return 'High';
  if (flags.some((f) => f.priority === 'Medium')) return 'Medium';
  if (flags.some((f) => f.priority === 'Low'))    return 'Low';
  return 'None';
}

// ──────────────────────────────────────────────────────────────────────────────
// Main export — generate report
// ──────────────────────────────────────────────────────────────────────────────

/**
 * generateReport
 *
 * Analyses a survey record and produces a structured `EngineeringReport`.
 * This is a pure function — it performs no I/O and can be unit-tested directly.
 */
export function generateReport(survey: SurveyInput): EngineeringReport {
  const checklist = survey.checklist ?? [];
  const meta = survey.metadata as SurveyMeta | null | undefined;

  const flags: ReportFlag[] = [];

  // Category-specific metadata analysis
  if (meta?.type === 'roof_mount')    flags.push(...evaluateRoofMount(meta));
  if (meta?.type === 'ground_mount')  flags.push(...evaluateGroundMount(meta));
  if (meta?.type === 'solar_fencing') flags.push(...evaluateSolarFencing(meta));

  // Checklist analysis (applies to all categories)
  flags.push(...evaluateChecklist(checklist));

  const checklistSummary = summariseChecklist(checklist);
  const recommendations  = buildRecommendations(flags, checklistSummary);
  const overallRisk      = calcOverallRisk(flags);

  return {
    survey_id:         survey.id,
    project_name:      survey.project_name,
    site_name:         survey.site_name,
    site_address:      survey.site_address ?? null,
    inspector_name:    survey.inspector_name,
    category:          survey.category_name ?? null,
    latitude:          survey.latitude  ?? null,
    longitude:         survey.longitude ?? null,
    survey_date:       survey.survey_date,
    generated_at:      new Date().toISOString(),
    overall_risk:      overallRisk,
    flags,
    checklist_summary: checklistSummary,
    recommendations,
    metadata:          meta ? (meta as unknown as Record<string, unknown>) : null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown export
// ──────────────────────────────────────────────────────────────────────────────

const RISK_EMOJI: Record<OverallRisk, string> = {
  High:   '🔴',
  Medium: '🟡',
  Low:    '🟢',
  None:   '✅',
};

const FLAG_EMOJI: Record<FlagPriority, string> = {
  High:   '🔴',
  Medium: '🟡',
  Low:    '🟢',
};

/**
 * toMarkdown
 *
 * Converts an `EngineeringReport` to a clean Markdown document suitable
 * for attaching to a project folder or sharing via email / cloud storage.
 */
export function toMarkdown(report: EngineeringReport): string {
  const date = new Date(report.survey_date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const generated = new Date(report.generated_at).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const lines: string[] = [
    `# Engineering Assessment Report`,
    ``,
    `| Field            | Value |`,
    `|------------------|-------|`,
    `| **Project**      | ${report.project_name} |`,
    `| **Site**         | ${report.site_name} |`,
    report.site_address ? `| **Address**      | ${report.site_address} |` : '',
    `| **Inspector**    | ${report.inspector_name} |`,
    report.category ? `| **Category**     | ${report.category} |` : '',
    `| **Survey Date**  | ${date} |`,
    `| **Report Date**  | ${generated} |`,
    (report.latitude != null && report.longitude != null)
      ? `| **Coordinates**  | ${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)} |`
      : '',
    ``,
    `## Overall Risk: ${RISK_EMOJI[report.overall_risk]} ${report.overall_risk}`,
    ``,
  ];

  // Flags
  if (report.flags.length > 0) {
    lines.push(`## ⚠ Design Flags`);
    lines.push(``);
    for (const flag of report.flags) {
      lines.push(`### ${FLAG_EMOJI[flag.priority]} ${flag.priority} — ${flag.category}`);
      if (flag.field) lines.push(`**Field:** \`${flag.field}\``);
      lines.push(``);
      lines.push(flag.message);
      lines.push(``);
    }
  } else {
    lines.push(`## ✅ No Design Flags`);
    lines.push(``);
    lines.push('No critical conditions were detected during automated analysis.');
    lines.push(``);
  }

  // Recommendations
  lines.push(`## 📋 Recommendations`);
  lines.push(``);
  for (const rec of report.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push(``);

  // Checklist summary
  const cs = report.checklist_summary;
  if (cs.total > 0) {
    lines.push(`## ✔ Checklist Summary`);
    lines.push(``);
    lines.push(`| Status  | Count |`);
    lines.push(`|---------|-------|`);
    lines.push(`| ✅ Pass    | ${cs.pass} |`);
    lines.push(`| ❌ Fail    | ${cs.fail} |`);
    lines.push(`| ⏳ Pending | ${cs.pending} |`);
    lines.push(`| — N/A    | ${cs.na} |`);
    lines.push(`| **Total** | **${cs.total}** |`);
    lines.push(``);
  }

  // Installation specs
  if (report.metadata) {
    lines.push(`## 🔧 Installation Specifications`);
    lines.push(``);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    for (const [k, v] of Object.entries(report.metadata)) {
      if (k === 'type') continue;
      const label = k.replace(/_/g, ' ');
      const value = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—');
      lines.push(`| ${label} | ${value} |`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Generated automatically by the Site Survey App*`);

  return lines.filter((l) => l !== null && l !== undefined).join('\n');
}
