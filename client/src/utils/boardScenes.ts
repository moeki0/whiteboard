import { rtdb } from "../config/firebase";
import { ref, onValue, set, remove, get, push } from "firebase/database";
import { BoardScene } from "../types";

// シーン一覧を取得
export const getBoardScenes = (
  boardId: string,
  callback: (scenes: BoardScene[]) => void
): (() => void) => {
  const scenesRef = ref(rtdb, `boards/${boardId}/scenes`);
  
  const unsubscribe = onValue(scenesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const scenes = Object.entries(data).map(([id, scene]) => ({
        id,
        ...(scene as Omit<BoardScene, 'id'>),
      }));
      scenes.sort((a, b) => b.createdAt - a.createdAt);
      callback(scenes);
    } else {
      callback([]);
    }
  });

  return unsubscribe;
};

// 新しいシーンを作成
export const createBoardScene = async (
  boardId: string,
  sceneName: string,
  userId: string,
  sourceSceneId?: string
): Promise<string | null> => {
  try {
    const scenesRef = ref(rtdb, `boards/${boardId}/scenes`);
    const newSceneRef = push(scenesRef);
    const sceneId = newSceneRef.key;
    
    if (!sceneId) {
      throw new Error("Failed to generate scene ID");
    }

    const now = Date.now();
    const newScene: BoardScene = {
      id: sceneId,
      name: sceneName,
      createdAt: now,
      createdBy: userId,
      isMain: false,
      lastModified: now,
    };

    // シーンを作成
    await set(newSceneRef, newScene);

    // ソースシーンが指定されている場合、そのnotesをコピー
    if (sourceSceneId) {
      const sourceNotesRef = ref(rtdb, `boards/${boardId}/scenes/${sourceSceneId}/notes`);
      const sourceNotesSnapshot = await get(sourceNotesRef);
      
      if (sourceNotesSnapshot.exists()) {
        const sourceNotes = sourceNotesSnapshot.val();
        const targetNotesRef = ref(rtdb, `boards/${boardId}/scenes/${sceneId}/notes`);
        await set(targetNotesRef, sourceNotes);
      }
    }

    return sceneId;
  } catch (error) {
    console.error("Error creating scene:", error);
    return null;
  }
};

// シーンを削除
export const deleteBoardScene = async (
  boardId: string,
  sceneId: string
): Promise<boolean> => {
  try {
    // シーンとそのnotesを削除
    const sceneRef = ref(rtdb, `boards/${boardId}/scenes/${sceneId}`);
    await remove(sceneRef);
    return true;
  } catch (error) {
    console.error("Error deleting scene:", error);
    return false;
  }
};

// シーンの名前を更新
export const updateSceneName = async (
  boardId: string,
  sceneId: string,
  newName: string
): Promise<boolean> => {
  try {
    const nameRef = ref(rtdb, `boards/${boardId}/scenes/${sceneId}/name`);
    const lastModifiedRef = ref(rtdb, `boards/${boardId}/scenes/${sceneId}/lastModified`);
    await set(nameRef, newName);
    await set(lastModifiedRef, Date.now());
    return true;
  } catch (error) {
    console.error("Error updating scene name:", error);
    return false;
  }
};

// メインシーンを作成（既存のnotesを移行用）
export const createMainScene = async (
  boardId: string,
  userId: string
): Promise<string | null> => {
  try {
    const mainSceneId = 'main';
    const sceneRef = ref(rtdb, `boards/${boardId}/scenes/${mainSceneId}`);
    
    const now = Date.now();
    const mainScene: BoardScene = {
      id: mainSceneId,
      name: 'Main Scene',
      createdAt: now,
      createdBy: userId,
      isMain: true,
      lastModified: now,
    };

    await set(sceneRef, mainScene);

    // 既存のnotesをメインシーンに移行
    const oldNotesRef = ref(rtdb, `boards/${boardId}/notes`);
    const notesSnapshot = await get(oldNotesRef);
    
    if (notesSnapshot.exists()) {
      const notes = notesSnapshot.val();
      const mainSceneNotesRef = ref(rtdb, `boards/${boardId}/scenes/${mainSceneId}/notes`);
      await set(mainSceneNotesRef, notes);
      
      // 古いnotesを削除
      await remove(oldNotesRef);
    }

    return mainSceneId;
  } catch (error) {
    console.error("Error creating main scene:", error);
    return null;
  }
};