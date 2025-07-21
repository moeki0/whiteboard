import { 
  getMigrationConfig, 
  updateMigrationConfig, 
  getAllMigrationStatuses,
  updateMigrationStatus,
  MigrationConfig,
  MigrationStatus
} from "./migrationManager";
import { migrateToNewStructure } from "./boardDataStructure";
import { safeMigrateProject, cleanupFailedMigration } from "./migrationCleanup";

/**
 * 移行コントロールパネル
 * 開発者がブラウザコンソールから使用するツール
 */
class MigrationControlPanel {
  
  /**
   * 現在の移行設定を表示
   */
  async showConfig(): Promise<void> {
    const config = await getMigrationConfig();
    console.table(config);
  }
  
  /**
   * 全プロジェクトの移行状態を表示
   */
  async showStatus(): Promise<void> {
    const statuses = await getAllMigrationStatuses();
    const statusArray = Object.values(statuses);
    
    if (statusArray.length === 0) {
      console.log('📊 No migration statuses found');
      return;
    }
    
    console.log('📊 Migration Status Summary:');
    const summary = statusArray.reduce((acc, status) => {
      acc[status.status] = (acc[status.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.table(summary);
    console.log('\n📊 Detailed Status:');
    console.table(statusArray.map(s => ({
      projectId: s.projectId,
      status: s.status,
      migratedAt: s.migratedAt ? new Date(s.migratedAt).toLocaleString() : '-',
      error: s.errorMessage || '-'
    })));
  }
  
  /**
   * 段階的移行を開始
   */
  async startGradualMigration(targetProjectIds: string[] = []): Promise<void> {
    console.log('🚀 Starting gradual migration...');
    
    await updateMigrationConfig({
      enableGradualMigration: true,
      enableAutoMigration: true,
      targetProjectIds,
      preferNewStructure: false // 最初は慎重に
    });
    
    console.log(`✅ Gradual migration enabled for ${targetProjectIds.length ? targetProjectIds.length + ' specific projects' : 'all projects'}`);
    console.log('💡 Next access to these projects will trigger automatic migration');
  }
  
  /**
   * 新構造を優先するように設定
   */
  async enableNewStructure(targetProjectIds: string[] = []): Promise<void> {
    console.log('🔄 Enabling new structure preference...');
    
    await updateMigrationConfig({
      preferNewStructure: true,
      targetProjectIds
    });
    
    console.log('✅ New structure is now preferred');
  }
  
  /**
   * 特定のプロジェクトを即座に移行
   */
  async migrateProject(projectId: string): Promise<void> {
    console.log(`🔄 Migrating project ${projectId}...`);
    
    try {
      await safeMigrateProject(projectId, migrateToNewStructure);
      console.log(`✅ Project ${projectId} migrated successfully`);
    } catch (error) {
      console.error(`❌ Migration failed for ${projectId}:`, error);
    }
  }
  
  /**
   * 複数のプロジェクトを順次移行
   */
  async migrateProjects(projectIds: string[]): Promise<void> {
    console.log(`🔄 Migrating ${projectIds.length} projects...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const projectId of projectIds) {
      try {
        await this.migrateProject(projectId);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to migrate ${projectId}:`, error);
        errorCount++;
      }
    }
    
    console.log(`📊 Migration completed: ${successCount} success, ${errorCount} errors`);
  }
  
  /**
   * エラー状態のプロジェクトをリセット
   */
  async resetErrorProjects(): Promise<void> {
    const statuses = await getAllMigrationStatuses();
    const errorProjects = Object.values(statuses)
      .filter(s => s.status === 'error')
      .map(s => s.projectId);
    
    if (errorProjects.length === 0) {
      console.log('📊 No error projects found');
      return;
    }
    
    console.log(`🧹 Cleaning up ${errorProjects.length} error projects...`);
    
    for (const projectId of errorProjects) {
      await cleanupFailedMigration(projectId);
    }
    
    console.log(`✅ Cleaned up ${errorProjects.length} error projects`);
  }
  
  /**
   * 特定のプロジェクトの移行データをクリーンアップ
   */
  async cleanupProject(projectId: string): Promise<void> {
    console.log(`🧹 Cleaning up project ${projectId}...`);
    await cleanupFailedMigration(projectId);
    console.log(`✅ Project ${projectId} cleaned up successfully`);
  }
  
  /**
   * 移行を無効にして旧構造に戻す
   */
  async disableMigration(): Promise<void> {
    console.log('⏹️  Disabling migration...');
    
    await updateMigrationConfig({
      enableGradualMigration: false,
      enableAutoMigration: false,
      preferNewStructure: false
    });
    
    console.log('✅ Migration disabled, using old structure for all projects');
  }
  
  /**
   * 移行の安全チェック
   */
  async safetyCheck(): Promise<void> {
    const config = await getMigrationConfig();
    const statuses = await getAllMigrationStatuses();
    
    console.log('🔒 Migration Safety Check:');
    console.log(`- Gradual Migration: ${config.enableGradualMigration ? '✅' : '❌'}`);
    console.log(`- Auto Migration: ${config.enableAutoMigration ? '✅' : '❌'}`);
    console.log(`- Prefer New Structure: ${config.preferNewStructure ? '✅' : '❌'}`);
    console.log(`- Target Projects: ${config.targetProjectIds.length || 'All'}`);
    
    const statusCounts = Object.values(statuses).reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n📊 Current Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`- ${status}: ${count}`);
    });
    
    // 警告
    if (config.enableAutoMigration && config.targetProjectIds.length === 0) {
      console.warn('⚠️  WARNING: Auto migration is enabled for ALL projects!');
    }
    
    if (config.preferNewStructure) {
      console.warn('⚠️  WARNING: New structure is preferred. Ensure migration is completed.');
    }
  }
  
  /**
   * ヘルプを表示
   */
  help(): void {
    console.log(`
🎛️  Migration Control Panel Commands:

📊 Status & Configuration:
  migrationPanel.showConfig()       - Show current migration settings
  migrationPanel.showStatus()       - Show all project migration statuses
  migrationPanel.safetyCheck()      - Perform safety check

🚀 Starting Migration:
  migrationPanel.startGradualMigration()          - Enable gradual migration for all projects
  migrationPanel.startGradualMigration(['proj1']) - Enable for specific projects
  migrationPanel.enableNewStructure()             - Switch to prefer new structure

🔄 Manual Migration:
  migrationPanel.migrateProject('projectId')      - Migrate specific project
  migrationPanel.migrateProjects(['p1', 'p2'])    - Migrate multiple projects

🛠️  Maintenance:
  migrationPanel.resetErrorProjects()             - Clean up projects with error status  
  migrationPanel.cleanupProject('projectId')      - Clean up specific project
  migrationPanel.disableMigration()               - Disable migration (revert to old structure)

⚡ Quick Start (Recommended):
  1. migrationPanel.safetyCheck()
  2. migrationPanel.startGradualMigration(['test-project-id'])
  3. migrationPanel.showStatus()
  4. migrationPanel.enableNewStructure()
    `);
  }
}

// グローバルに公開
const migrationPanel = new MigrationControlPanel();
(window as any).migrationPanel = migrationPanel;

console.log('🎛️  Migration Control Panel loaded! Type migrationPanel.help() for usage instructions.');

export { migrationPanel };