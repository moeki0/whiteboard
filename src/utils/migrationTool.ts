import { migrateToNewStructure, migrateAllProjects } from "./boardDataStructure";
import "./migrationControlPanel";
import "./migrationCleanup";

/**
 * マイグレーションツール
 * 開発者がコンソールから実行するためのヘルパー関数
 */

// グローバルに公開してコンソールから実行可能にする
((window as unknown) as { migrationTool: { migrateProject: (projectId: string) => Promise<void> } }).migrationTool = {
  /**
   * 特定のプロジェクトをマイグレーション
   * @param projectId プロジェクトID
   */
  async migrateProject(projectId: string) {
    console.log(`Starting migration for project: ${projectId}`);
    try {
      await migrateToNewStructure(projectId);
      console.log(`✅ Migration completed for project: ${projectId}`);
    } catch (error) {
      console.error(`❌ Migration failed for project: ${projectId}`, error);
    }
  },

  /**
   * 全プロジェクトをマイグレーション
   */
  async migrateAll() {
    console.log('Starting migration for all projects...');
    try {
      await migrateAllProjects();
      console.log('✅ Migration completed for all projects');
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  },

  /**
   * 使用方法を表示
   */
  help() {
    console.log(`
🔧 Migration Tool Usage:

1. 特定のプロジェクトをマイグレーション:
   migrationTool.migrateProject('your-project-id')

2. 全プロジェクトをマイグレーション:
   migrationTool.migrateAll()

3. このヘルプを表示:
   migrationTool.help()

⚠️ 注意事項:
- マイグレーションは本番環境で実行する前にテスト環境でテストしてください
- バックアップを取ってから実行することをお勧めします
- 大量のデータがある場合は時間がかかる場合があります
    `);
  }
};

// 初回ロード時にヘルプを表示
console.log(`
🔧 Migration Tools Loaded:

📋 migrationTool    - Basic migration commands (legacy)
🎛️  migrationPanel  - Advanced migration control panel (recommended)

Type migrationPanel.help() for modern migration management!
`);