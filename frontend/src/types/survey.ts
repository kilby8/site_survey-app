export type SurveyStatus = 'draft' | 'submitted';
export type ChecklistStatus = 'pass' | 'fail' | 'n/a' | 'pending';

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  notes: string;
}

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface Photo {
  id: string;
  name: string;
  dataUrl: string;
  capturedAt: string;
}

export interface Survey {
  id: string;
  title: string;
  siteName: string;
  siteAddress: string;
  inspectorName: string;
  dateTime: string;
  gpsCoordinates: GpsCoordinates | null;
  checklist: ChecklistItem[];
  notes: string;
  photos: Photo[];
  status: SurveyStatus;
  createdAt: string;
  updatedAt: string;
}

export type SurveyFormData = Omit<Survey, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_CHECKLIST_ITEMS: Omit<ChecklistItem, 'id'>[] = [
  { label: 'Site Access', status: 'pending', notes: '' },
  { label: 'Power Supply', status: 'pending', notes: '' },
  { label: 'Network Connectivity', status: 'pending', notes: '' },
  { label: 'Safety Compliance', status: 'pending', notes: '' },
  { label: 'Equipment Condition', status: 'pending', notes: '' },
  { label: 'Documentation Review', status: 'pending', notes: '' },
];
