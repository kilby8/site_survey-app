/**
 * components/ChecklistEditor.tsx
 *
 * Renders a list of checklist items with pass/fail/n-a/pending toggles.
 * Supports adding custom items and editing notes inline.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
} from 'react-native';
import type { ChecklistStatus } from '../types';

export interface ChecklistItemDraft {
  label:  string;
  status: ChecklistStatus;
  notes:  string;
}

interface Props {
  items:    ChecklistItemDraft[];
  onChange: (items: ChecklistItemDraft[]) => void;
}

const STATUS_OPTIONS: { value: ChecklistStatus; label: string; color: string }[] = [
  { value: 'pass',    label: '✓ Pass',    color: '#16a34a' },
  { value: 'fail',    label: '✗ Fail',    color: '#dc2626' },
  { value: 'n/a',     label: '— N/A',     color: '#6b7280' },
  { value: 'pending', label: '? Pending', color: '#f59e0b' },
];

export default function ChecklistEditor({ items, onChange }: Props) {
  const [newLabel, setNewLabel] = useState('');

  function setStatus(idx: number, status: ChecklistStatus) {
    const next = [...items];
    next[idx] = { ...next[idx], status };
    onChange(next);
  }

  function setNotes(idx: number, notes: string) {
    const next = [...items];
    next[idx] = { ...next[idx], notes };
    onChange(next);
  }

  function addItem() {
    const label = newLabel.trim();
    if (!label) return;
    onChange([...items, { label, status: 'pending', notes: '' }]);
    setNewLabel('');
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Checklist</Text>

      {items.map((item, idx) => {
        const opt = STATUS_OPTIONS.find(o => o.value === item.status) ?? STATUS_OPTIONS[3];
        return (
          <View key={idx} style={styles.item}>
            {/* Label + remove */}
            <View style={styles.itemHeader}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={8}>
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status buttons */}
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.value}
                  style={[
                    styles.statusBtn,
                    item.status === o.value && { backgroundColor: o.color, borderColor: o.color },
                  ]}
                  onPress={() => setStatus(idx, o.value)}
                >
                  <Text
                    style={[
                      styles.statusBtnText,
                      item.status === o.value && styles.statusBtnTextActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status indicator */}
            <View style={[styles.statusIndicator, { backgroundColor: opt.color }]}>
              <Text style={styles.statusIndicatorText}>{opt.label}</Text>
            </View>

            {/* Notes input */}
            <TextInput
              style={styles.notesInput}
              placeholder="Notes (optional)"
              placeholderTextColor="#9ca3af"
              value={item.notes}
              onChangeText={t => setNotes(idx, t)}
              multiline
            />
          </View>
        );
      })}

      {/* Add new item */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add checklist item…"
          placeholderTextColor="#9ca3af"
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newLabel.trim() && styles.addBtnDisabled]}
          onPress={addItem}
          disabled={!newLabel.trim()}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { marginBottom: 16 },
  sectionTitle:       { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  item: {
    backgroundColor: '#f9fafb',
    borderRadius:    8,
    padding:         12,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  itemHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   8,
  },
  itemLabel:         { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 },
  removeBtn:         { fontSize: 14, color: '#9ca3af', paddingLeft: 8 },
  statusRow: {
    flexDirection:  'row',
    gap:             6,
    flexWrap:        'wrap',
    marginBottom:    6,
  },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical:    6,
    borderRadius:       20,
    borderWidth:        1.5,
    borderColor:        '#d1d5db',
    backgroundColor:    '#ffffff',
    minHeight:          36,
    justifyContent:     'center',
  },
  statusBtnText:     { fontSize: 12, color: '#374151', fontWeight: '600' },
  statusBtnTextActive: { color: '#ffffff' },
  statusIndicator: {
    alignSelf:         'flex-start',
    paddingHorizontal:  8,
    paddingVertical:    3,
    borderRadius:       12,
    marginBottom:       6,
  },
  statusIndicatorText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  notesInput: {
    borderWidth:  1,
    borderColor:  '#e5e7eb',
    borderRadius: 6,
    padding:      8,
    fontSize:     13,
    color:        '#374151',
    backgroundColor: '#ffffff',
    minHeight:    36,
  },
  addRow: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     4,
  },
  addInput: {
    flex:         1,
    borderWidth:  1,
    borderColor:  '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:     14,
    color:        '#111827',
    backgroundColor: '#ffffff',
    minHeight:    44,
  },
  addBtn: {
    backgroundColor: '#1a56db',
    paddingHorizontal: 16,
    borderRadius:    8,
    justifyContent:  'center',
    minHeight:       44,
  },
  addBtnDisabled: { backgroundColor: '#93c5fd' },
  addBtnText:     { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
