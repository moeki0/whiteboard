import { describe, it, expect } from 'vitest';
import {
  sortScenes,
  createSceneObject,
  validateSceneName,
  isMainScene,
  filterScenesByDateRange,
  filterScenesByCreator,
} from '../utils/boardScenesLogic';
import { BoardScene } from '../types';

describe('boardScenesLogic', () => {
  const mockScenes: BoardScene[] = [
    {
      id: 'scene1',
      name: 'Scene 1',
      createdAt: 1000,
      createdBy: 'user1',
      isMain: false,
      lastModified: 1000,
    },
    {
      id: 'scene2',
      name: 'Scene 2',
      createdAt: 2000,
      createdBy: 'user2',
      isMain: false,
      lastModified: 2000,
    },
    {
      id: 'main',
      name: 'Main Scene',
      createdAt: 500,
      createdBy: 'user1',
      isMain: true,
      lastModified: 500,
    },
  ];

  describe('sortScenes', () => {
    it('作成日時の降順でシーンをソートする', () => {
      const sorted = sortScenes([...mockScenes]);
      expect(sorted[0].createdAt).toBe(2000);
      expect(sorted[1].createdAt).toBe(1000);
      expect(sorted[2].createdAt).toBe(500);
    });

    it('空の配列でもエラーにならない', () => {
      const sorted = sortScenes([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('createSceneObject', () => {
    it('正しいシーンオブジェクトを作成する', () => {
      const scene = createSceneObject('test-id', 'Test Scene', 'user1');
      
      expect(scene.id).toBe('test-id');
      expect(scene.name).toBe('Test Scene');
      expect(scene.createdBy).toBe('user1');
      expect(scene.isMain).toBe(false);
      expect(typeof scene.createdAt).toBe('number');
      expect(typeof scene.lastModified).toBe('number');
      expect(scene.createdAt).toBe(scene.lastModified);
    });

    it('メインシーンとして作成できる', () => {
      const scene = createSceneObject('main-id', 'Main Scene', 'user1', true);
      
      expect(scene.isMain).toBe(true);
    });
  });

  describe('validateSceneName', () => {
    it('有効なシーン名を正しく検証する', () => {
      expect(validateSceneName('Valid Scene')).toEqual({ isValid: true });
      expect(validateSceneName('  Valid Scene  ')).toEqual({ isValid: true });
      expect(validateSceneName('A')).toEqual({ isValid: true });
    });

    it('空のシーン名は無効', () => {
      expect(validateSceneName('')).toEqual({
        isValid: false,
        error: 'Scene name cannot be empty',
      });
      expect(validateSceneName('   ')).toEqual({
        isValid: false,
        error: 'Scene name cannot be empty',
      });
    });

    it('50文字を超えるシーン名は無効', () => {
      const longName = 'A'.repeat(51);
      expect(validateSceneName(longName)).toEqual({
        isValid: false,
        error: 'Scene name must be 50 characters or less',
      });
    });
  });

  describe('isMainScene', () => {
    it('isMainがtrueのシーンをメインシーンとして認識する', () => {
      const mainScene = mockScenes.find(s => s.isMain);
      expect(isMainScene(mainScene!)).toBe(true);
    });

    it('IDが"main"のシーンをメインシーンとして認識する', () => {
      const mainScene = { ...mockScenes[0], id: 'main', isMain: false };
      expect(isMainScene(mainScene)).toBe(true);
    });

    it('通常のシーンはメインシーンではない', () => {
      const normalScene = mockScenes.find(s => !s.isMain && s.id !== 'main');
      expect(isMainScene(normalScene!)).toBe(false);
    });
  });

  describe('filterScenesByDateRange', () => {
    it('指定された日時範囲内のシーンをフィルタリングする', () => {
      const filtered = filterScenesByDateRange(mockScenes, 900, 1500);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('scene1');
    });

    it('範囲外のシーンは除外される', () => {
      const filtered = filterScenesByDateRange(mockScenes, 3000, 4000);
      
      expect(filtered.length).toBe(0);
    });

    it('境界値を含む', () => {
      const filtered = filterScenesByDateRange(mockScenes, 1000, 2000);
      
      expect(filtered.length).toBe(2);
    });
  });

  describe('filterScenesByCreator', () => {
    it('指定されたユーザーが作成したシーンをフィルタリングする', () => {
      const filtered = filterScenesByCreator(mockScenes, 'user1');
      
      expect(filtered.length).toBe(2);
      expect(filtered.every(s => s.createdBy === 'user1')).toBe(true);
    });

    it('該当するシーンがない場合は空の配列を返す', () => {
      const filtered = filterScenesByCreator(mockScenes, 'nonexistent');
      
      expect(filtered.length).toBe(0);
    });
  });
});