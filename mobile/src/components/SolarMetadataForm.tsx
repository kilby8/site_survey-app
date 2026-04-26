import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Image, Alert,
} from 'react-native';
import type {
  SurveyMetadata,
  GroundMountMetadata,
  RoofMountMetadata,
  SolarFencingMetadata,
  CommercialThreePhaseMetadata,
} from '../types';
import { solarProTheme } from '../theme/solarProTheme';
import VoiceNoteInput from './VoiceNoteInput';
import { captureFromCamera, pickFromLibrary } from '../services/photoService';

const { colors } = solarProTheme;

interface Props {
  categoryId: string | null;
  metadata:   SurveyMetadata | null;
  onChange:   (metadata: SurveyMetadata | null) => void;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Small reusable primitives
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Default metadata objects
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
const DEFAULT_3PHASE: CommercialThreePhaseMetadata = {
  type: 'commercial_3phase',
  customer_name: '',
  customer_address: '',
  city: '',
  state: '',
  zip: '',
  parcel_number: '',
  utility_having_jurisdiction: '',
  municipality_having_jurisdiction: '',
  nec_code_year: null,
  snow_load_lbs_sqft: null,
  seismic_rating: null,
  building_height_ft: null,
  max_wind_speed_mph: null,
  wind_exposure: null,
  desired_pv_system_size_kw_dc: null,
  module_make_model: '',
  number_of_modules: null,
  module_tilt_angle_deg: null,
  module_azimuth_deg: null,
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Section components
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      {/* Rafter photo */}
      <FieldLabel text="Rafter Photo" />
      <Text style={styles.hint}>Use a tape measure to show size and spacing</Text>
      {meta.rafter_photo_uri ? (
        <View style={styles.rafterPhotoWrap}>
          <Image source={{ uri: meta.rafter_photo_uri }} style={styles.rafterPhoto} />
          <TouchableOpacity
            style={styles.rafterPhotoRemove}
            onPress={() => set('rafter_photo_uri', null)}
            hitSlop={8}
          >
            <Text style={styles.rafterPhotoRemoveText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.rafterBtnRow}>
          <TouchableOpacity
            style={styles.rafterBtn}
            onPress={async () => {
              try {
                const p = await captureFromCamera();
                if (p) set('rafter_photo_uri', p.uri);
              } catch (e) { Alert.alert('Camera error', String(e)); }
            }}
          >
            <Text style={styles.rafterBtnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rafterBtn, styles.rafterBtnAlt]}
            onPress={async () => {
              try {
                const p = await pickFromLibrary();
                if (p) set('rafter_photo_uri', p.uri);
              } catch (e) { Alert.alert('Library error', String(e)); }
            }}
          >
            <Text style={[styles.rafterBtnText, styles.rafterBtnAltText]}>🖼 Library</Text>
          </TouchableOpacity>
        </View>
      )}

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

      <FieldLabel text="Azimuth – primary roof plane (° compass)" />
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
      <Text style={styles.sectionTitle}>âš¡ Solar Fencing Details</Text>

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

function LabeledNumberField({
  label,
  placeholder,
  value,
  onChange,
  decimal,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
}) {
  return (
    <>
      <FieldLabel text={label} />
      <NumberInput
        value={value}
        placeholder={placeholder}
        decimal={decimal}
        onChange={onChange}
      />
    </>
  );
}

function LabeledTextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <FieldLabel text={label} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
      />
    </>
  );
}

function CommercialThreePhaseSection({
  meta,
  onChange,
}: {
  meta: CommercialThreePhaseMetadata;
  onChange: (m: CommercialThreePhaseMetadata) => void;
}) {
  const set = <K extends keyof CommercialThreePhaseMetadata>(k: K, v: CommercialThreePhaseMetadata[K]) =>
    onChange({ ...meta, [k]: v });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🏢 Commercial 3-Phase Survey</Text>

      <Text style={styles.groupHeader}>1. Project Site Information</Text>
      <LabeledTextField
        label="Customer Name"
        placeholder="Enter customer name"
        value={meta.customer_name}
        onChange={(v) => set('customer_name', v)}
      />
      <LabeledTextField
        label="Customer Address"
        placeholder="Street address"
        value={meta.customer_address}
        onChange={(v) => set('customer_address', v)}
      />
      <LabeledTextField
        label="City"
        placeholder="City"
        value={meta.city}
        onChange={(v) => set('city', v)}
      />
      <LabeledTextField
        label="State"
        placeholder="State"
        value={meta.state}
        onChange={(v) => set('state', v)}
      />
      <LabeledTextField
        label="Zip"
        placeholder="Zip"
        value={meta.zip}
        onChange={(v) => set('zip', v)}
      />
      <LabeledTextField
        label="Parcel Number"
        placeholder="Parcel/APN"
        value={meta.parcel_number}
        onChange={(v) => set('parcel_number', v)}
      />
      <LabeledTextField
        label="Utility Having Jurisdiction"
        placeholder="Utility name"
        value={meta.utility_having_jurisdiction}
        onChange={(v) => set('utility_having_jurisdiction', v)}
      />
      <LabeledTextField
        label="Municipality Having Jurisdiction"
        placeholder="Municipality"
        value={meta.municipality_having_jurisdiction}
        onChange={(v) => set('municipality_having_jurisdiction', v)}
      />
      <FieldLabel text="NEC Code Year" />
      <Selector
        options={['2014', '2017', '2020', '2023'] as const}
        value={meta.nec_code_year != null ? String(meta.nec_code_year) as '2014' | '2017' | '2020' | '2023' : null}
        onSelect={(v) => set('nec_code_year', parseInt(v, 10))}
      />

      <Text style={styles.groupHeader}>2. Environmental & Structural Constraints</Text>
      <LabeledNumberField
        label="Snow Load (lbs/sqft)"
        placeholder="e.g. 30"
        value={meta.snow_load_lbs_sqft}
        decimal
        onChange={(v) => set('snow_load_lbs_sqft', v)}
      />
      <FieldLabel text="Seismic Rating" />
      <Selector
        options={['A', 'B', 'C', 'D', 'E', 'F'] as const}
        value={meta.seismic_rating}
        onSelect={(v) => set('seismic_rating', v)}
      />
      <LabeledNumberField
        label="Building Height (ft)"
        placeholder="e.g. 28"
        value={meta.building_height_ft}
        decimal
        onChange={(v) => set('building_height_ft', v)}
      />
      <LabeledNumberField
        label="Max Wind Speed (MPH)"
        placeholder="e.g. 115"
        value={meta.max_wind_speed_mph}
        decimal
        onChange={(v) => set('max_wind_speed_mph', v)}
      />
      <FieldLabel text="Wind Exposure" />
      <Selector
        options={['B', 'C', 'D'] as const}
        value={meta.wind_exposure}
        onSelect={(v) => set('wind_exposure', v)}
      />

      <Text style={styles.groupHeader}>3. PV System Information</Text>
      <LabeledNumberField
        label="Desired Solar PV System Size (STC)"
        placeholder="kW DC"
        value={meta.desired_pv_system_size_kw_dc}
        decimal
        onChange={(v) => set('desired_pv_system_size_kw_dc', v)}
      />
      <LabeledTextField
        label="Module Make/Model"
        placeholder="Manufacturer and model"
        value={meta.module_make_model}
        onChange={(v) => set('module_make_model', v)}
      />
      <LabeledNumberField
        label="Number of Modules"
        placeholder="e.g. 455"
        value={meta.number_of_modules}
        onChange={(v) => set('number_of_modules', v)}
      />
      <LabeledNumberField
        label="Module Tilt Angle (degrees)"
        placeholder="e.g. 10"
        value={meta.module_tilt_angle_deg}
        decimal
        onChange={(v) => set('module_tilt_angle_deg', v)}
      />
      <LabeledNumberField
        label="Module Azimuth (degrees)"
        placeholder="e.g. 180"
        value={meta.module_azimuth_deg}
        decimal
        onChange={(v) => set('module_azimuth_deg', v)}
      />
    </View>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main export
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  if (categoryId === 'commercial_3phase') {
    return (
      <CommercialThreePhaseSection
        meta={ensureMeta(DEFAULT_3PHASE)}
        onChange={onChange}
      />
    );
  }

  // Non-solar category – render nothing
  return null;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Styles
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  groupHeader: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 8,
    marginTop: -2,
  },
  rafterPhotoWrap: {
    position: 'relative',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  rafterPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
  },
  rafterPhotoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rafterPhotoRemoveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rafterBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  rafterBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rafterBtnAlt: {
    backgroundColor: colors.inputBg,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  rafterBtnText: { color: '#0B1220', fontSize: 14, fontWeight: '700' },
  rafterBtnAltText: { color: colors.primary },
});
