import { Project, Board } from '../types';

/**
 * プロジェクトのメンバーシップをチェック
 */
export function checkProjectMembership(
  project: Project | null,
  userId: string
): boolean {
  if (!project || !project.members) {
    return false;
  }
  
  return !!project.members[userId];
}

/**
 * プロジェクトでのユーザーの役割を取得
 */
export function getUserRole(
  project: Project | null,
  userId: string
): string | null {
  if (!project || !project.members || !project.members[userId]) {
    return null;
  }
  
  return project.members[userId].role;
}

/**
 * ユーザーがプロジェクトのオーナーかチェック
 */
export function isProjectOwner(
  project: Project | null,
  userId: string
): boolean {
  const role = getUserRole(project, userId);
  return role === 'owner';
}

/**
 * ユーザーがプロジェクトのメンバー（オーナー含む）かチェック
 */
export function isProjectMember(
  project: Project | null,
  userId: string
): boolean {
  return checkProjectMembership(project, userId);
}

/**
 * ボードへのアクセス権限をチェック
 */
export function checkBoardAccess(
  board: Board | null,
  project: Project | null,
  userId: string | null
): {
  hasAccess: boolean;
  reason?: string;
} {
  if (!board) {
    return { hasAccess: false, reason: 'Board not found' };
  }

  if (!project) {
    return { hasAccess: false, reason: 'Project not found' };
  }

  // パブリックプロジェクトの場合は誰でもアクセス可能（未ログインユーザー含む）
  if (project.isPublic) {
    return { hasAccess: true };
  }

  // プライベートプロジェクトの場合はログインしているプロジェクトメンバーのみ
  if (!userId) {
    return { hasAccess: false, reason: 'Login required for private projects' };
  }

  const isMember = isProjectMember(project, userId);
  if (!isMember) {
    return { hasAccess: false, reason: 'Not a project member' };
  }

  return { hasAccess: true };
}

/**
 * ボードの編集権限をチェック
 */
export function checkBoardEditPermission(
  board: Board | null,
  project: Project | null,
  userId: string | null
): {
  canEdit: boolean;
  reason?: string;
} {
  const accessCheck = checkBoardAccess(board, project, userId);
  if (!accessCheck.hasAccess) {
    return { canEdit: false, reason: accessCheck.reason };
  }

  // 編集にはログインが必要（パブリック・プライベート問わず）
  if (!userId) {
    return { canEdit: false, reason: 'Login required for editing' };
  }

  if (!project) {
    return { canEdit: false, reason: 'Project not found' };
  }

  // プロジェクトメンバーのみ編集可能
  const isMember = isProjectMember(project, userId);
  if (!isMember) {
    return { canEdit: false, reason: 'Not a project member' };
  }

  return { canEdit: true };
}

/**
 * プロジェクト設定の編集権限をチェック
 */
export function checkProjectEditPermission(
  project: Project | null,
  userId: string
): {
  canEdit: boolean;
  reason?: string;
} {
  if (!project) {
    return { canEdit: false, reason: 'Project not found' };
  }

  const role = getUserRole(project, userId);
  if (!role) {
    return { canEdit: false, reason: 'Not a project member' };
  }

  // オーナーのみプロジェクト設定を編集可能
  if (role !== 'owner') {
    return { canEdit: false, reason: 'Only owners can edit project settings' };
  }

  return { canEdit: true };
}

/**
 * メンバー管理権限をチェック
 */
export function checkMemberManagementPermission(
  project: Project | null,
  userId: string
): {
  canManage: boolean;
  reason?: string;
} {
  if (!project) {
    return { canManage: false, reason: 'Project not found' };
  }

  const role = getUserRole(project, userId);
  if (!role) {
    return { canManage: false, reason: 'Not a project member' };
  }

  // オーナーのみメンバー管理可能
  if (role !== 'owner') {
    return { canManage: false, reason: 'Only owners can manage members' };
  }

  return { canManage: true };
}

/**
 * プロジェクト削除権限をチェック
 */
export function checkProjectDeletePermission(
  project: Project | null,
  userId: string
): {
  canDelete: boolean;
  reason?: string;
} {
  if (!project) {
    return { canDelete: false, reason: 'Project not found' };
  }

  // プロジェクト作成者のみ削除可能
  if (project.createdBy !== userId) {
    return { canDelete: false, reason: 'Only project creator can delete' };
  }

  return { canDelete: true };
}