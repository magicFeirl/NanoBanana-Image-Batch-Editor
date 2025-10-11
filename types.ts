
export enum ImageStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface EditHistory {
  dataUrl: string;
  prompt: string;
  timestamp: number;
}

export interface ImageFile {
  id: string;
  file: File;
  originalDataUrl: string;
  editedDataUrl?: string;
  status: ImageStatus;
  prompt?: string;
  error?: string;
  retried?: boolean;
  history?: EditHistory[];
  hasBeenAutoTaggedInModal?: boolean;
}