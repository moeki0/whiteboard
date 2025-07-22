// moekiプロジェクト専用の移行実行スクリプト
import { 
  updateMigrationConfig, 
  updateMigrationStatus,
  getMigrationStatus,
  shouldUseNewStructure 
} from './migrationManager';
import { migrateToNewStructure } from './boardDataStructure';

/**
 * moekiプロジェクトのみを移行する関数
 */
export async function migrateMoekiProject(): Promise<void> {
  const projectId = 'moeki';
  console.log('🚀 Starting migration for moeki project...');
  
  try {
    // 1. 現在の移行状態をチェック
    const currentStatus = await getMigrationStatus(projectId);
    console.log('📊 Current status for moeki:', currentStatus);
    
    if (currentStatus.status === 'migrated') {
      console.log('✅ moeki project is already migrated!');
      
      // 新構造を使用するかチェック
      const useNewStructure = await shouldUseNewStructure(projectId);
      console.log(`📋 Using ${useNewStructure ? 'NEW' : 'OLD'} structure`);
      return;
    }
    
    // 2. 移行設定を更新（moekiプロジェクトのみを対象）
    console.log('🔧 Configuring gradual migration for moeki project...');
    await updateMigrationConfig({
      enableGradualMigration: true,
      enableAutoMigration: true,
      preferNewStructure: false, // まずは慎重に
      targetProjectIds: ['moeki']
    });
    
    // 3. 移行実行
    console.log('🔄 Executing migration...');
    await updateMigrationStatus(projectId, 'migrating');
    
    const migrationStart = performance.now();
    
    try {
      await migrateToNewStructure(projectId);
      const migrationEnd = performance.now();
      
      await updateMigrationStatus(projectId, 'migrated');
      console.log(`✅ Migration completed in ${(migrationEnd - migrationStart).toFixed(2)}ms`);
      
    } catch (migrationError) {
      // 移行エラーをキャッチして詳細処理
      if (migrationError instanceof Error && migrationError.message.includes('No boards found')) {
        // ボードがない場合は正常な状態として扱う
        await updateMigrationStatus(projectId, 'migrated');
        const migrationEnd = performance.now();
        console.log(`✅ Migration completed (no boards to migrate) in ${(migrationEnd - migrationStart).toFixed(2)}ms`);
      } else {
        // 実際のエラーの場合
        throw migrationError;
      }
    }
    
    // 4. 新構造を優先に設定
    console.log('⚡ Enabling new structure preference...');
    await updateMigrationConfig({
      enableGradualMigration: true,
      enableAutoMigration: true,
      preferNewStructure: true,
      targetProjectIds: ['moeki']
    });
    
    // 5. 最終確認
    const finalStatus = await getMigrationStatus(projectId);
    const useNewStructure = await shouldUseNewStructure(projectId);
    
    console.log('📊 Final migration status:', finalStatus);
    console.log(`🎯 moeki project will now use ${useNewStructure ? 'NEW' : 'OLD'} structure`);
    
    console.log(`
✅ moeki project migration completed successfully!

🎯 What happened:
- Migrated existing board data to new optimized structure
- Configured system to use new structure for moeki project only
- Other projects continue using old structure (safe)

🚀 Expected improvements:
- BoardList loading: ~15x faster (from N+1 to 1 query)
- Page transitions: Near-instant with caching
- Better error handling and fallbacks

💡 Next steps:
- Test the BoardList in moeki project
- Monitor console logs for performance metrics
- If successful, migrate more projects gradually
    `);
    
  } catch (error) {
    console.error('❌ Migration failed for moeki project:', error);
    await updateMigrationStatus(projectId, 'error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// グローバルに公開（開発環境のみ）
if (import.meta.env.DEV) {
  ((window as unknown) as { migrateMoekiProject: typeof migrateMoekiProject }).migrateMoekiProject = migrateMoekiProject;
  
  console.log(`
🎯 moeki Migration Ready!

Quick commands:
- migrateMoekiProject()     // Execute migration
- migrationPanel.showStatus()  // Check status
- migrationPanel.safetyCheck() // Safety check

Type migrateMoekiProject() to start!
  `);
}