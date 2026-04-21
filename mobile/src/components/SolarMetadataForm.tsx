import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
} from 'react-native';
import type {
  SurveyMetadata,
  GroundMountMetadata,
  RoofMountMetadata,
  SolarFencingMetadata,
} from '../types';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

interface Props {
  categoryId: string | null;
  metadata:   SurveyMetadata | null;
  onChange:   (metadata: SurveyMetadata | null) => void;
}

// ──────────────────────────────────────────────────────────────────
// Small reusable primitives
// ──────────────────────────────────────────────────────────────────

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {text}{required && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

/** Horizontal button-group selector (for enum fields). */
function Selector<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: readonly T[];
  value:   T | null;
  onSelect:(v: T) => void;
}) {
  return (
    <View style={styles.selectorRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.selBtn, value === opt && styles.selBtnActive]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[styles.selBtnText, value === opt && styles.selBtnTextActive]}>
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Yes / No toggle. */
function BooleanToggle({
  value,
  onChange,
}: {
  value:    boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.boolRow}>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.inputBorder, true: colors.primaryDark }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
      <Text style={[styles.boolLabel, { color: value ? colors.primary : colors.textSecondary }]}>
        {value ? 'Yes' : 'No'}
      </Text>
    </View>
  );
}

/** Decimal / numeric text input. */
function NumberInput({
  value,
  placeholder,
  onChange,
  decimal,
}: {
  value:       number | null;
  placeholder: string;
  onChange:    (v: number | null) => void;
  decimal?:    boolean;
}) {
  return (
    <TextInput
      style={styles.input}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={value != null ? String(value) : ''}
      onChangeText={(t) => {
        if (t === '' || t === '-') { onChange(null); return; }
        const n = decimal ? parseFloat(t) : parseInt(t, 10);
        onChange(isNaN(n) ? null : n);
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Default metadata objects
// ──────────────────────────────────────────────────────────────────

const DEFAULT_GROUND: GroundMountMetadata = {
  type: 'ground_mount', soil_type: null, slope_degrees: null,
  trenching_path: '', vegetation_clearing: false,
};
const DEFAULT_ROOF: RoofMountMetadata = {
  type: 'roof_mount', roof_material: null, rafter_size: null,
  rafter_spacing: null, roof_age_years: null, azimuth: null,
};
const DEFAULT_FENCING: SolarFencingMetadata = {
  type: 'solar_fencing', perimeter_length_ft: null,
  lower_shade_risk: false, foundation_type: null, bifacial_surface: null,
};

// ──────────────────────────────────────────────────────────────────
// Section components
// ──────────────────────────────────────────────────────────────────

function GroundMountSection({
  meta,
  onChange,
}: {
  meta:     GroundMountMetadata;
  onChange: (m: GroundMountMetadata) => void;
}) {
  const set = <K extends keyof GroundMountMetadata>(k: K, v: GroundMountMetadata[K]) =>
    onChange({ ...meta, [k]: v });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🌱 Ground Mount Details</Text>

      <FieldLabel text="Soil Type" />
      <Selector
        options={['Rocky', 'Sandy', 'Clay', 'Organic/Loam'] as const}
        value={meta.soil_type}
        onSelect={(v) => set('soil_type', v)}
      />

      <FieldLabel text="Slope / Topography (degrees)" />
      <NumberInput
        value={meta.slope_degrees}
        placeholder="e.g. 3.5"
        decimal
        onChange={(v) => set('slope_degrees', v)}
      />

      <FieldLabel text="Trenching Path Notes" />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Note underground obstructions, irrigation lines, etc."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
        value={meta.trenching_path}
        onChangeText={(t) => set('trenching_path', t)}
      />

      <FieldLabel text="Vegetation Clearing Required?" />
      <BooleanToggle
        value={meta.vegetation_clearing}
        onChange={(v) => set('vegetation_clearing', v)}
      />
    </View>
  );
}

function RoofMountSection({
  meta,
  onChange,
}: {
  meta:     RoofMountMetadata;
  onChange: (m: RoofMountMetadata) => void;
}) {
  const set = <K extends keyof RoofMountMetadata>(k: K, v: RoofMountMetadata[K]) =>
    onChange({ ...meta, [k]: v });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🏠 Roof Mount Details</Text>

      <FieldLabel text="Roof Material" />
      <Selector
        options={['Asphalt Shingle', 'Metal', 'Tile', 'Membrane'] as const}
        value={meta.roof_material}
        onSelect={(v) => set('roof_material', v)}
      />

      <FieldLabel text="Rafter Size" />
      <Selector
        options={['2x4', '2x6', '2x8'] as const}
        value={meta.rafter_size}
        onSelect={(v) => set('rafter_size', v)}
      />

      <FieldLabel text="Rafter Spacing" />
      <Selector
        options={['16in', '24in'] as const}
        value={meta.rafter_spacing}
        onSelect={(v) => set('rafter_spacing', v)}
      />

      <FieldLabel text="Roof Age (years)" />
      <NumberInput
        value={meta.roof_age_years}
        placeholder="e.g. 8"
        decimal={false}
        onChange={(v) => set('roof_age_years', v)}
      />

      <FieldLabel text="Azimuth — primary roof plane (° compass)" />
      <NumberInput
        value={meta.azimuth}
        placeholder="e.g. 185 (south-facing)"
        decimal
        onChange={(v) => set('azimuth', v)}
      />
    </View>
  );
}

function SolarFencingSection({
  meta,
  onChange,
}: {
  meta:     SolarFencingMetadata;
  onChange: (m: SolarFencingMetadata) => void;
}) {
  const set = <K extends keyof SolarFencingMetadata>(k: K, v: SolarFencingMetadata[K]) =>
    onChange({ ...meta, [k]: v });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>⚡ Solar Fencing Details</Text>

      <FieldLabel text="Perimeter Length (linear feet)" />
      <NumberInput
        value={meta.perimeter_length_ft}
        placeholder="e.g. 1200"
        decimal={false}
        onChange={(v) => set('perimeter_length_ft', v)}
      />

      <FieldLabel text="Low-Lying Obstructions Present? (increases shade risk)" />
      <BooleanToggle
        value={meta.lower_shade_risk}
        onChange={(v) => set('lower_shade_risk', v)}
      />

      <FieldLabel text="Foundation Type" />
      <Selector
        options={['Driven Piles', 'Concrete Footer'] as const}
        value={meta.foundation_type}
        onSelect={(v) => set('foundation_type', v)}
      />

      <FieldLabel text="Bifacial Ground Surface" />
      <Selector
        options={['Concrete', 'Gravel', 'Grass', 'Dirt'] as const}
        value={meta.bifacial_surface}
        onSelect={(v) => set('bifacial_surface', v)}
      />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────

export default function SolarMetadataForm({ categoryId, metadata, onChange }: Props) {
  // Initialise default metadata when the category changes to a solar type
  // and no metadata has been set yet.
  function ensureMeta<T extends SurveyMetadata>(defaults: T): T {
    if (metadata?.type === defaults.type) return metadata as T;
    return defaults;
  }

  if (categoryId === 'ground_mount') {
    return (
      <GroundMountSection
        meta={ensureMeta(DEFAULT_GROUND)}
        onChange={onChange}
      />
    );
  }

  if (categoryId === 'roof_mount') {
    return (
      <RoofMountSection
        meta={ensureMeta(DEFAULT_ROOF)}
        onChange={onChange}
      />
    );
  }

  if (categoryId === 'solar_fencing') {
    return (
      <SolarFencingSection
        meta={ensureMeta(DEFAULT_FENCING)}
        onChange={onChange}
      />
    );
  }

  // Non-solar category — render nothing
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderRadius:    12,
    padding:         14,
    borderWidth:     1.5,
    borderColor:     colors.border,
    marginBottom:    12,
  },
  sectionTitle: {
    fontSize:     16,
    fontWeight:   '800',
    color:        colors.textPrimary,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize:     13,
    fontWeight:   '600',
    color:        colors.textSecondary,
    marginBottom:  4,
    marginTop:     10,
  },
  required: { color: colors.errorText },
  selectorRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            6,
    marginBottom:   4,
  },
  selBtn: {
    paddingHorizontal: 12,
    paddingVertical:    7,
    borderRadius:      20,
    borderWidth:       1.5,
    borderColor:       colors.inputBorder,
    backgroundColor:   colors.inputBg,
    minHeight:         36,
    justifyContent:    'center',
  },
  selBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  selBtnText:       { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  selBtnTextActive: { color: colors.background },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth:      1,
    borderColor:      colors.inputBorder,
    borderRadius:     10,
    paddingHorizontal: 14,
    paddingVertical:   10,
    fontSize:         14,
    color:            colors.textPrimary,
    marginBottom:      4,
    minHeight:         44,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  boolRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            10,
    paddingVertical: 6,
  },
  boolLabel: { fontSize: 15, fontWeight: '700' },
});
