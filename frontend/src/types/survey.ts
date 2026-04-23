export type SurveyStatus = 'draft' | 'submitted';
export type ChecklistStatus = 'pass' | 'fail' | 'n/a' | 'pending';

export interface FallbackProjectTemplate {
  id: string;
  project_id: string;
  project_name: string | null;
  site_name: string | null;
  site_address: string | null;
  inspector_name: string | null;
  category_id: string | null;
  category_name: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy: number | null;
  metadata: unknown;
  status: string;
  created_at: string;
}

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
