import { ref, set, remove, get } from 'firebase/database';
import { rtdb } from '../config/firebase';

/**
 * プロジェクトスラグインデックスに追加
 */
export async function addProjectSlugIndex(
  projectId: string,
  slug: string
): Promise<void> {
  if (!slug || slug.trim() === '') return;
  
  const indexRef = ref(rtdb, `projectSlugIndex/${slug}`);
  await set(indexRef, projectId);
}

/**
 * プロジェクトスラグインデックスから削除
 */
export async function removeProjectSlugIndex(
  slug: string
): Promise<void> {
  if (!slug || slug.trim() === '') return;
  
  const indexRef = ref(rtdb, `projectSlugIndex/${slug}`);
  await remove(indexRef);
}

/**
 * プロジェクトスラグからprojectIdを取得
 */
export async function getProjectIdBySlug(
  slug: string
): Promise<string | null> {
  if (!slug || slug.trim() === '') return null;
  
  const indexRef = ref(rtdb, `projectSlugIndex/${slug}`);
  console.log(`📍 Direct index lookup for path: projectSlugIndex/${slug}`);
  const snapshot = await get(indexRef);
  const result = snapshot.val() || null;
  console.log(`📍 Direct index result:`, result);
  return result;
}

/**
 * 既存のプロジェクトスラグインデックスを更新
 */
export async function updateProjectSlugIndex(
  projectId: string,
  oldSlug: string,
  newSlug: string
): Promise<void> {
  // 古いインデックスを削除
  if (oldSlug && oldSlug.trim() !== '') {
    await removeProjectSlugIndex(oldSlug);
  }
  
  // 新しいインデックスを追加
  if (newSlug && newSlug.trim() !== '') {
    await addProjectSlugIndex(projectId, newSlug);
  }
}