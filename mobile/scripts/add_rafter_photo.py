import os

ROOT = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src'

# -- 1. Add rafter_photo_uri to RoofMountMetadata type --------------------------
tf = os.path.join(ROOT, 'types', 'index.ts')
t = open(tf, encoding='utf-8').read()
t = t.replace(
    '    rafter_size: "2x4" | "2x6" | "2x8" | null;\n'
    '    rafter_spacing: "16in" | "24in" | null;',
    '    rafter_photo_uri: string | null;\n'
    '    rafter_size: "2x4" | "2x6" | "2x8" | null;\n'
    '    rafter_spacing: "16in" | "24in" | null;'
)
open(tf, 'w', encoding='utf-8').write(t)
print('types updated')

# -- 2. Patch SolarMetadataForm default + UI ------------------------------------
ff = os.path.join(ROOT, 'components', 'SolarMetadataForm.tsx')
f = open(ff, encoding='utf-8').read()

# Add Image + Alert to RN imports
f = f.replace(
    'import {\n  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,\n} from \'react-native\';',
    'import {\n  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Image, Alert,\n} from \'react-native\';'
)

# Add photoService import after existing imports
f = f.replace(
    "import { solarProTheme } from '../theme/solarProTheme';",
    "import { solarProTheme } from '../theme/solarProTheme';\nimport { captureFromCamera, pickFromLibrary } from '../services/photoService';"
)

# Add rafter_photo_uri to default initializer
f = f.replace(
    "      type: 'roof_mount', roof_material: null, rafter_size: null,\n"
    "      rafter_spacing: null, roof_age_years: null, azimuth: null,",
    "      type: 'roof_mount', roof_material: null, rafter_photo_uri: null, rafter_size: null,\n"
    "      rafter_spacing: null, roof_age_years: null, azimuth: null,"
)

# Add photo capture UI above <FieldLabel text="Rafter Size" />
RAFTER_UI = (
    '      {/* Rafter photo */}\n'
    '      <FieldLabel text="Rafter Photo" />\n'
    '      <Text style={styles.hint}>Use a tape measure to show size and spacing</Text>\n'
    '      {(meta as any).rafter_photo_uri ? (\n'
    '        <View style={styles.rafterPhotoWrap}>\n'
    '          <Image source={{ uri: (meta as any).rafter_photo_uri }} style={styles.rafterPhoto} />\n'
    '          <TouchableOpacity\n'
    '            style={styles.rafterPhotoRemove}\n'
    '            onPress={() => set(\'rafter_photo_uri\', null)}\n'
    '            hitSlop={8}\n'
    '          >\n'
    '            <Text style={styles.rafterPhotoRemoveText}>\u2715</Text>\n'
    '          </TouchableOpacity>\n'
    '        </View>\n'
    '      ) : (\n'
    '        <View style={styles.rafterBtnRow}>\n'
    '          <TouchableOpacity\n'
    '            style={styles.rafterBtn}\n'
    "            onPress={async () => {\n"
    "              try {\n"
    "                const p = await captureFromCamera();\n"
    "                if (p) set('rafter_photo_uri', p.uri);\n"
    "              } catch (e) { Alert.alert('Camera error', String(e)); }\n"
    "            }}\n"
    '          >\n'
    '            <Text style={styles.rafterBtnText}>\U0001f4f7 Camera</Text>\n'
    '          </TouchableOpacity>\n'
    '          <TouchableOpacity\n'
    '            style={[styles.rafterBtn, styles.rafterBtnAlt]}\n'
    "            onPress={async () => {\n"
    "              try {\n"
    "                const p = await pickFromLibrary();\n"
    "                if (p) set('rafter_photo_uri', p.uri);\n"
    "              } catch (e) { Alert.alert('Library error', String(e)); }\n"
    "            }}\n"
    '          >\n'
    '            <Text style={[styles.rafterBtnText, styles.rafterBtnAltText]}>\U0001f5bc Library</Text>\n'
    '          </TouchableOpacity>\n'
    '        </View>\n'
    '      )}\n'
    '\n'
    '      <FieldLabel text="Rafter Size" />\n'
)

f = f.replace(
    '      <FieldLabel text="Rafter Size" />\n',
    RAFTER_UI
)

# Add styles before the closing of StyleSheet
RAFTER_STYLES = (
    '  hint: {\n'
    '    fontSize: 11,\n'
    '    color: colors.textMuted,\n'
    '    fontStyle: \'italic\',\n'
    '    marginBottom: 8,\n'
    '    marginTop: -2,\n'
    '  },\n'
    '  rafterPhotoWrap: {\n'
    '    position: \'relative\',\n'
    '    marginBottom: 12,\n'
    '    alignSelf: \'flex-start\',\n'
    '  },\n'
    '  rafterPhoto: {\n'
    '    width: \'100%\',\n'
    '    height: 180,\n'
    '    borderRadius: 10,\n'
    '    backgroundColor: colors.inputBg,\n'
    '  },\n'
    '  rafterPhotoRemove: {\n'
    '    position: \'absolute\',\n'
    '    top: 6,\n'
    '    right: 6,\n'
    '    backgroundColor: \'rgba(0,0,0,0.6)\',\n'
    '    borderRadius: 12,\n'
    '    width: 26,\n'
    '    height: 26,\n'
    '    alignItems: \'center\',\n'
    '    justifyContent: \'center\',\n'
    '  },\n'
    '  rafterPhotoRemoveText: { color: \'#fff\', fontSize: 13, fontWeight: \'700\' },\n'
    '  rafterBtnRow: {\n'
    '    flexDirection: \'row\',\n'
    '    gap: 10,\n'
    '    marginBottom: 12,\n'
    '  },\n'
    '  rafterBtn: {\n'
    '    flex: 1,\n'
    '    backgroundColor: colors.primary,\n'
    '    paddingVertical: 13,\n'
    '    borderRadius: 10,\n'
    '    alignItems: \'center\',\n'
    '    justifyContent: \'center\',\n'
    '  },\n'
    '  rafterBtnAlt: {\n'
    '    backgroundColor: colors.inputBg,\n'
    '    borderWidth: 1.5,\n'
    '    borderColor: colors.primary,\n'
    '  },\n'
    '  rafterBtnText: { color: \'#0B1220\', fontSize: 14, fontWeight: \'700\' },\n'
    '  rafterBtnAltText: { color: colors.primary },\n'
)

# Insert before the last closing }); of StyleSheet
last_close = f.rfind('});')
f = f[:last_close] + RAFTER_STYLES + f[last_close:]

open(ff, 'w', encoding='utf-8').write(f)
print('SolarMetadataForm updated, len', len(f))
