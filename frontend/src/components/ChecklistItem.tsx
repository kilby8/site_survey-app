import React from 'react';
import type { ChecklistItem as ChecklistItemType, ChecklistStatus } from '../types/survey';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onChange: (updated: ChecklistItemType) => void;
  onRemove: (id: string) => void;
}

const STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'n/a', label: 'N/A' },
];

const ChecklistItem: React.FC<ChecklistItemProps> = ({ item, onChange, onRemove }) => {
  const handleStatusChange = (status: ChecklistStatus) => {
    onChange({ ...item, status });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...item, notes: e.target.value });
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...item, label: e.target.value });
  };

  return (
    <div className={`checklist-item checklist-item--${item.status}`}>
      <div className="checklist-item-header">
        <input
          type="text"
          className="checklist-label-input"
          value={item.label}
          onChange={handleLabelChange}
          placeholder="Item name"
          aria-label="Checklist item name"
        />
        <button
          type="button"
          className="btn-icon btn-icon--danger"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.label}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="checklist-status-row">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`status-btn status-btn--${opt.value} ${item.status === opt.value ? 'active' : ''}`}
            onClick={() => handleStatusChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="checklist-notes-input"
        value={item.notes}
        onChange={handleNotesChange}
        placeholder="Notes (optional)"
        aria-label={`Notes for ${item.label}`}
      />
    </div>
  );
};

export default ChecklistItem;
