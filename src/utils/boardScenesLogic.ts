import { BoardScene } from '../types';

/**
 * シーンリストをソートする
 */
export function sortScenes(scenes: BoardScene[]): BoardScene[] {
  return scenes.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 新しいシーンオブジェクトを作成する
 */
export function createSceneObject(
  sceneId: string,
  sceneName: string,
  userId: string,
  isMain: boolean = false
): BoardScene {
  const now = Date.now();
  return {
    id: sceneId,
    name: sceneName,
    createdAt: now,
    createdBy: userId,
    isMain,
    lastModified: now,
  };
}

/**
 * シーン名を検証する
 */
export function validateSceneName(name: string): { isValid: boolean; error?: string } {
  const trimmed = name.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Scene name cannot be empty' };
  }
  
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Scene name must be 50 characters or less' };
  }
  
  return { isValid: true };
}

/**
 * メインシーンかどうかを判定する
 */
export function isMainScene(scene: BoardScene): boolean {
  return scene.isMain === true || scene.id === 'main';
}

/**
 * シーンを作成日時でフィルタリングする
 */
export function filterScenesByDateRange(
  scenes: BoardScene[],
  startDate: number,
  endDate: number
): BoardScene[] {
  return scenes.filter(scene => 
    scene.createdAt >= startDate && scene.createdAt <= endDate
  );
}

/**
 * シーンを作成者でフィルタリングする
 */
export function filterScenesByCreator(
  scenes: BoardScene[],
  userId: string
): BoardScene[] {
  return scenes.filter(scene => scene.createdBy === userId);
}