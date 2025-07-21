import { ref, get, set } from "firebase/database";
import { rtdb } from "../config/firebase";

/**
 * プロジェクトの移行状態を管理
 */
export interface MigrationStatus {
  projectId: string;
  status: 'not_migrated' | 'migrating' | 'migrated' | 'error';
  migratedAt?: number;
  errorMessage?: string;
  version?: string; // データ構造のバージョン
}

/**
 * 移行設定
 */
export interface MigrationConfig {
  // 段階的移行を有効にするか
  enableGradualMigration: boolean;
  // 新構造を優先するか（false: 旧構造優先、true: 新構造優先）
  preferNewStructure: boolean;
  // 自動移行を有効にするか
  enableAutoMigration: boolean;
  // 移行対象のプロジェクトID配列（空の場合は全プロジェクト）
  targetProjectIds: string[];
  // 移行の最大実行時間（ミリ秒）
  maxMigrationTime: number;
}

const DEFAULT_CONFIG: MigrationConfig = {
  enableGradualMigration: true,
  preferNewStructure: false, // 安全のため最初は旧構造を優先
  enableAutoMigration: false,
  targetProjectIds: [],
  maxMigrationTime: 30000 // 30秒
};

/**
 * 移行設定を取得
 */
export async function getMigrationConfig(): Promise<MigrationConfig> {
  try {
    const configRef = ref(rtdb, 'migrationConfig');
    const snapshot = await get(configRef);
    
    if (snapshot.exists()) {
      return { ...DEFAULT_CONFIG, ...snapshot.val() };
    }
    
    return DEFAULT_CONFIG;
  } catch (error) {
    console.warn('Failed to get migration config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 移行設定を更新
 */
export async function updateMigrationConfig(config: Partial<MigrationConfig>): Promise<void> {
  try {
    const configRef = ref(rtdb, 'migrationConfig');
    const currentConfig = await getMigrationConfig();
    const newConfig = { ...currentConfig, ...config };
    await set(configRef, newConfig);
    console.log('Migration config updated:', newConfig);
  } catch (error) {
    console.error('Failed to update migration config:', error);
    throw error;
  }
}

/**
 * プロジェクトの移行状態を取得
 */
export async function getMigrationStatus(projectId: string): Promise<MigrationStatus> {
  try {
    const statusRef = ref(rtdb, `migrationStatus/${projectId}`);
    const snapshot = await get(statusRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    return {
      projectId,
      status: 'not_migrated'
    };
  } catch (error) {
    console.warn(`Failed to get migration status for ${projectId}:`, error);
    return {
      projectId,
      status: 'not_migrated'
    };
  }
}

/**
 * プロジェクトの移行状態を更新
 */
export async function updateMigrationStatus(
  projectId: string, 
  status: MigrationStatus['status'],
  errorMessage?: string
): Promise<void> {
  try {
    const migrationStatus: any = {
      projectId,
      status,
      version: '1.0'
    };
    
    // migratedAtはmigratedステータスの場合のみ設定
    if (status === 'migrated') {
      migrationStatus.migratedAt = Date.now();
    }
    
    // errorMessageはエラー時のみ設定
    if (errorMessage) {
      migrationStatus.errorMessage = errorMessage;
    }
    
    const statusRef = ref(rtdb, `migrationStatus/${projectId}`);
    await set(statusRef, migrationStatus);
  } catch (error) {
    console.error(`Failed to update migration status for ${projectId}:`, error);
  }
}

/**
 * プロジェクトが新構造を使用すべきかを判定
 */
export async function shouldUseNewStructure(projectId: string): Promise<boolean> {
  try {
    const [config, status] = await Promise.all([
      getMigrationConfig(),
      getMigrationStatus(projectId)
    ]);
    
    // 段階的移行が無効の場合は設定に従う
    if (!config.enableGradualMigration) {
      return config.preferNewStructure;
    }
    
    // 特定のプロジェクトのみが対象の場合
    if (config.targetProjectIds.length > 0) {
      if (!config.targetProjectIds.includes(projectId)) {
        return false; // 対象外は旧構造を使用
      }
    }
    
    // 移行状態に基づく判定
    switch (status.status) {
      case 'migrated':
        return true; // 移行完了済みは新構造を使用
      case 'migrating':
        return false; // 移行中は旧構造を使用（安全のため）
      case 'error':
        return false; // エラー状態は旧構造を使用
      case 'not_migrated':
      default:
        return config.preferNewStructure; // 設定に従う
    }
  } catch (error) {
    console.warn(`Failed to determine structure for ${projectId}:`, error);
    return false; // エラー時は安全のため旧構造を使用
  }
}

/**
 * プロジェクトが自動移行の対象かを判定
 */
export async function shouldAutoMigrate(projectId: string): Promise<boolean> {
  try {
    const [config, status] = await Promise.all([
      getMigrationConfig(),
      getMigrationStatus(projectId)
    ]);
    
    // 自動移行が無効の場合
    if (!config.enableAutoMigration) {
      return false;
    }
    
    // 既に移行済みまたは移行中の場合
    if (status.status === 'migrated' || status.status === 'migrating') {
      return false;
    }
    
    // 特定のプロジェクトのみが対象の場合
    if (config.targetProjectIds.length > 0) {
      return config.targetProjectIds.includes(projectId);
    }
    
    // すべてのプロジェクトが対象
    return true;
  } catch (error) {
    console.warn(`Failed to determine auto migration for ${projectId}:`, error);
    return false;
  }
}

/**
 * 全プロジェクトの移行状態を取得
 */
export async function getAllMigrationStatuses(): Promise<Record<string, MigrationStatus>> {
  try {
    const statusRef = ref(rtdb, 'migrationStatus');
    const snapshot = await get(statusRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    return {};
  } catch (error) {
    console.error('Failed to get all migration statuses:', error);
    return {};
  }
}