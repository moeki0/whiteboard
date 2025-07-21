import { ref, remove, get } from "firebase/database";
import { rtdb } from "../config/firebase";
import { updateMigrationStatus } from "./migrationManager";

/**
 * 失敗した移行のクリーンアップ
 */
export async function cleanupFailedMigration(projectId: string): Promise<void> {
  try {
    console.log(`🧹 Cleaning up failed migration for project ${projectId}...`);
    
    // 部分的に作成された新構造データを削除
    const projectBoardsListRef = ref(rtdb, `projectBoardsList/${projectId}`);
    await remove(projectBoardsListRef);
    
    // 移行ステータスをリセット
    await updateMigrationStatus(projectId, 'not_migrated');
    
    console.log(`✅ Cleanup completed for project ${projectId}`);
  } catch (error) {
    console.error(`❌ Cleanup failed for project ${projectId}:`, error);
  }
}

/**
 * 安全な移行実行（エラー回復付き）
 */
export async function safeMigrateProject(
  projectId: string,
  migrateFunction: (projectId: string) => Promise<void>
): Promise<void> {
  try {
    await updateMigrationStatus(projectId, 'migrating');
    await migrateFunction(projectId);
    await updateMigrationStatus(projectId, 'migrated');
    console.log(`✅ Safe migration completed for project ${projectId}`);
  } catch (error) {
    console.error(`❌ Migration failed for project ${projectId}, cleaning up...`);
    
    // クリーンアップ実行
    await cleanupFailedMigration(projectId);
    
    // エラーステータスを設定
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateMigrationStatus(projectId, 'error', errorMessage);
    
    throw error;
  }
}

/**
 * 全プロジェクトのエラー状態をクリーンアップ
 */
export async function cleanupAllErrorProjects(): Promise<void> {
  try {
    const migrationStatusRef = ref(rtdb, 'migrationStatus');
    const snapshot = await get(migrationStatusRef);
    
    if (!snapshot.exists()) {
      console.log('📊 No migration statuses found');
      return;
    }
    
    const statuses = snapshot.val();
    const errorProjects = Object.values(statuses)
      .filter((status: any) => status.status === 'error')
      .map((status: any) => status.projectId);
    
    if (errorProjects.length === 0) {
      console.log('📊 No error projects found');
      return;
    }
    
    console.log(`🧹 Cleaning up ${errorProjects.length} error projects...`);
    
    for (const projectId of errorProjects) {
      await cleanupFailedMigration(projectId);
    }
    
    console.log(`✅ Cleaned up ${errorProjects.length} error projects`);
  } catch (error) {
    console.error('❌ Failed to cleanup error projects:', error);
  }
}

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  (window as any).migrationCleanup = {
    cleanupFailedMigration,
    safeMigrateProject,
    cleanupAllErrorProjects,
    
    help() {
      console.log(`
🧹 Migration Cleanup Commands:

migrationCleanup.cleanupFailedMigration('projectId')  - Clean specific project
migrationCleanup.cleanupAllErrorProjects()            - Clean all error projects
migrationCleanup.help()                               - Show this help
      `);
    }
  };
  
  console.log('🧹 Migration cleanup tools loaded! Type migrationCleanup.help() for usage.');
}