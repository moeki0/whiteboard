export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface BoardItem {
  id: string;
  type: 'note' | 'arrow' | 'group';
  userId: string;
  createdAt: number;
  zIndex: number;
  isDragging?: boolean;
  draggedBy?: string | null;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string | null;
  email: string;
  createdAt: number;
  updatedAt: number;
}

export interface Note extends BoardItem {
  type: 'note';
  content: string;
  x: number;
  y: number;
  color?: string;
  textSize?: string;
  updatedAt?: number;
  width: string;
  isEditing?: boolean;
  editedBy?: string | null;
  signedBy?: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
  } | null;
}

export interface Board {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  projectId: string;
  updatedAt?: number;
  isPinned?: boolean;
  pinnedAt?: number | null;
  sortScore?: number;
  metadata?: {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
  };
}

export interface BoardScene {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  createdBy: string;
  isMain: boolean;
  lastModified: number;
  thumbnail?: string;
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: number;
  inviteCode?: string;
  members: Record<string, ProjectMember>;
  isPublic: boolean;
  cosenseProjectName?: string;
}

export interface ProjectMember {
  role: "owner" | "admin" | "member";
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
  photoURL?: string | null;
  username?: string;
}

export interface HistoryAction {
  type: "CREATE_NOTES" | "DELETE_NOTES" | "MOVE_NOTES" | "EDIT_NOTE" | "CREATE_ARROW" | "DELETE_ARROW" | "CREATE_GROUP" | "DELETE_GROUP" | "UPDATE_GROUP";
  noteId?: string;
  userId: string;
  notes?: Note[];
  oldContent?: string;
  newContent?: string;
  moves?: Array<{
    noteId: string;
    oldPosition: { x: number; y: number };
    newPosition: { x: number; y: number };
  }>;
  // 矢印関連
  arrow?: Arrow;
  arrows?: Arrow[]; // 付箋削除時に一緒に削除される矢印リスト
  // グループ関連
  group?: Group;
  groupId?: string;
  oldNoteIds?: string[];
  newNoteIds?: string[];
}

export interface SlugHistory {
  oldSlug: string;
  newSlug: string;
  timestamp: number;
}

export interface NameHistory {
  oldName: string;
  newName: string;
  timestamp: number;
}

export interface Arrow extends BoardItem {
  type: 'arrow';
  startNoteId: string;
  endNoteId: string;
  startAnchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom';
  endAnchor?: 'auto' | 'left' | 'right' | 'top' | 'bottom';
}

export interface Group extends BoardItem {
  type: 'group';
  noteIds: string[];
  name?: string;
  color?: string;
}
