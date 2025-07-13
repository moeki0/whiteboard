export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Note {
  id: string;
  content: string;
  x: number;
  y: number;
  color: string;
  userId: string;
  createdAt: number;
  zIndex: number;
  width: number;
  isDragging?: boolean;
  draggedBy?: string | null;
  isEditing?: boolean;
  editedBy?: string | null;
}

export interface Board {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  projectId: string;
  isPublic: boolean;
  updatedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  inviteCode?: string;
  members: Record<string, ProjectMember>;
}

export interface ProjectMember {
  role: 'owner' | 'member';
  displayName: string;
  email: string;
  joinedAt: number;
}

export interface Cursor {
  x: number;
  y: number;
  name: string;
  fullName: string;
  color: string;
  timestamp: number;
}

export interface HistoryAction {
  type: 'CREATE_NOTE' | 'DELETE_NOTE' | 'MOVE_NOTE' | 'EDIT_NOTE';
  noteId: string;
  userId: string;
  note?: Note;
  oldPosition?: { x: number; y: number };
  newPosition?: { x: number; y: number };
  oldContent?: string;
  newContent?: string;
}