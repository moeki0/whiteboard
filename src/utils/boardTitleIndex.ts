import { ref, set, remove, get } from 'firebase/database';
import { rtdb } from '../config/firebase';

/**
 * ボードタイトルを正規化（検索用）
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '') // 空白を削除
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ''); // 英数字・ひらがな・カタカナ・漢字のみ
}

/**
 * ボードタイトルインデックスに追加
 */
export async function addBoardTitleIndex(
  projectId: string,
  boardId: string,
  title: string
): Promise<void> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return; // 空文字の場合はインデックス作成しない

  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  await set(indexRef, boardId);
}

/**
 * ボードタイトルインデックスから削除
 */
export async function removeBoardTitleIndex(
  projectId: string,
  title: string
): Promise<void> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return;

  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  await remove(indexRef);
}

/**
 * ボードタイトルからboardIdを取得
 */
export async function getBoardIdByTitle(
  projectId: string,
  title: string
): Promise<string | null> {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return null;

  const startTime = performance.now();
  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  const snapshot = await get(indexRef);
  console.log('[BoardTitleIndex] Lookup took:', performance.now() - startTime, 'ms');
  return snapshot.val() || null;
}

/**
 * 既存のボードタイトルインデックスを更新（タイトル変更時）
 */
export async function updateBoardTitleIndex(
  projectId: string,
  boardId: string,
  oldTitle: string,
  newTitle: string
): Promise<void> {
  // 古いインデックスを削除
  await removeBoardTitleIndex(projectId, oldTitle);
  
  // 新しいインデックスを追加
  await addBoardTitleIndex(projectId, boardId, newTitle);
}