import { rtdb } from "../config/firebase";
import { ref, set, remove, get } from "firebase/database";
import { Note, Board, Project } from "../types";

export const FirebaseUtils = {
  // Note operations
  async createNote(boardId: string, noteId: string, note: Omit<Note, 'id'>): Promise<void> {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    await set(noteRef, note);
  },

  async updateNote(boardId: string, noteId: string, updates: Partial<Note>): Promise<void> {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    const noteSnapshot = await get(noteRef);
    
    if (noteSnapshot.exists()) {
      const currentNote = noteSnapshot.val();
      await set(noteRef, { ...currentNote, ...updates });
    }
  },

  async deleteNote(boardId: string, noteId: string): Promise<void> {
    const noteRef = ref(rtdb, `boardNotes/${boardId}/${noteId}`);
    await remove(noteRef);
  },

  // Board operations
  async createBoard(boardId: string, board: Omit<Board, 'id'>): Promise<void> {
    const boardRef = ref(rtdb, `boards/${boardId}`);
    await set(boardRef, board);
  },

  async updateBoardName(boardId: string, name: string): Promise<void> {
    const boardRef = ref(rtdb, `boards/${boardId}/name`);
    await set(boardRef, name);
  },

  async getBoardData(boardId: string): Promise<Board | null> {
    const boardRef = ref(rtdb, `boards/${boardId}`);
    const snapshot = await get(boardRef);
    
    if (snapshot.exists()) {
      return { id: boardId, ...snapshot.val() } as Board;
    }
    
    return null;
  },

  // Project operations
  async getProjectData(projectId: string): Promise<Project | null> {
    const projectRef = ref(rtdb, `projects/${projectId}`);
    const snapshot = await get(projectRef);
    
    if (snapshot.exists()) {
      return { id: projectId, ...snapshot.val() } as Project;
    }
    
    return null;
  },

  async checkProjectMembership(projectId: string, userId: string): Promise<boolean> {
    const projectData = await this.getProjectData(projectId);
    return projectData?.members?.[userId] !== undefined;
  },
};