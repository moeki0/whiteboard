import { Project, Board } from '../types';

/**
 * Generate URL for project page
 */
export function generateProjectUrl(project: Project): string {
  return `/${project.slug}`;
}

/**
 * Generate URL for board page
 */
export function generateBoardUrl(project: Project, board: Board): string {
  return `/${project.slug}/${encodeURIComponent(board.name)}`;
}

/**
 * Generate URL for board settings
 */
export function generateBoardSettingsUrl(boardId: string): string {
  return `/board/${boardId}/settings`;
}

/**
 * Generate URL for project settings
 */
export function generateProjectSettingsUrl(projectId: string): string {
  return `/project/${projectId}/settings`;
}

/**
 * Generate invite URL
 */
export function generateInviteUrl(inviteCode: string): string {
  return `/invite/${inviteCode}`;
}