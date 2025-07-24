import { ref, get, set, update } from "firebase/database";
import { rtdb } from "../config/firebase";

/**
 * 既存の全プロジェクトからslugインデックスを構築
 */
export async function buildProjectSlugIndex(): Promise<void> {
  try {
    const startTime = performance.now();

    // 全プロジェクトを取得
    const projectsRef = ref(rtdb, "projects");
    const snapshot = await get(projectsRef);

    if (!snapshot.exists()) {
      return;
    }

    const projects = snapshot.val();
    const updates: Record<string, string> = {};
    let indexCount = 0;

    // 各プロジェクトのslugからインデックスを作成
    for (const [projectId, projectData] of Object.entries(projects)) {
      const project = projectData as any;
      if (project.slug && project.slug.trim() !== "") {
        updates[`projectSlugIndex/${project.slug}`] = projectId;
        indexCount++;
      }
    }

    if (indexCount > 0) {
      // バッチで更新
      await update(ref(rtdb), updates);
    }
  } catch (error) {
    console.error("❌ Error building slug index:", error);
    throw error;
  }
}

/**
 * 特定のプロジェクトのslugインデックスを更新
 */
export async function updateProjectSlugIndexForProject(
  projectId: string,
  slug: string
): Promise<void> {
  try {
    if (!slug || slug.trim() === "") {
      console.warn(`⚠️ Empty slug for project ${projectId}`);
      return;
    }

    const indexRef = ref(rtdb, `projectSlugIndex/${slug}`);
    await set(indexRef, projectId);
  } catch (error) {
    console.error(`❌ Error updating slug index for ${projectId}:`, error);
    throw error;
  }
}

/**
 * slugインデックスの状態を確認
 */
export async function checkSlugIndexStatus(): Promise<void> {
  try {
    const indexRef = ref(rtdb, "projectSlugIndex");
    const snapshot = await get(indexRef);

    if (snapshot.exists()) {
      const indexes = snapshot.val();
      const count = Object.keys(indexes).length;

      // 最初の5個を表示
      const entries = Object.entries(indexes).slice(0, 5);
      entries.forEach(([slug, projectId]) => {
        // Log entry if needed
      });

      if (count > 5) {
        // Handle remaining entries if needed
      }
    }
  } catch (error) {
    console.error("❌ Error checking slug index status:", error);
  }
}

// 開発環境でグローバルに公開
if (import.meta.env.DEV) {
  (window as any).buildSlugIndex = {
    build: buildProjectSlugIndex,
    check: checkSlugIndexStatus,
    update: updateProjectSlugIndexForProject,
  };
}
