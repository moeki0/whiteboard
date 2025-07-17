import { describe, it, expect } from 'vitest';
import { handleBracketCompletion, analyzeBoardTitleSuggestion, filterBoardSuggestions } from '../utils/textCompletion';
import { Board } from '../types';

describe('textCompletion', () => {
  describe('handleBracketCompletion', () => {
    it('[ を入力すると [] に補完される', () => {
      const result = handleBracketCompletion('', '[');
      
      expect(result.shouldComplete).toBe(true);
      expect(result.completedContent).toBe('[]');
      expect(result.cursorPosition).toBe(1);
    });

    it('テキストの後に [ を入力すると [] に補完される', () => {
      const result = handleBracketCompletion('hello', 'hello[');
      
      expect(result.shouldComplete).toBe(true);
      expect(result.completedContent).toBe('hello[]');
      expect(result.cursorPosition).toBe(6);
    });

    it('すでに [ が含まれている場合は補完しない', () => {
      const result = handleBracketCompletion('hello[', 'hello[world');
      
      expect(result.shouldComplete).toBe(false);
      expect(result.completedContent).toBe('hello[world');
      expect(result.cursorPosition).toBe(11);
    });

    it('文字が削除された場合は補完しない', () => {
      const result = handleBracketCompletion('hello[', 'hello');
      
      expect(result.shouldComplete).toBe(false);
      expect(result.completedContent).toBe('hello');
      expect(result.cursorPosition).toBe(5);
    });

    it('[ 以外の文字を入力した場合は補完しない', () => {
      const result = handleBracketCompletion('hello', 'helloa');
      
      expect(result.shouldComplete).toBe(false);
      expect(result.completedContent).toBe('helloa');
      expect(result.cursorPosition).toBe(6);
    });
  });

  describe('analyzeBoardTitleSuggestion', () => {
    it('[]内でカーソルがある場合は候補を表示', () => {
      const result = analyzeBoardTitleSuggestion('hello [world] test', 8);
      
      expect(result.shouldShow).toBe(true);
      expect(result.searchText).toBe('w');
      expect(result.bracketStart).toBe(6);
      expect(result.bracketEnd).toBe(12);
    });

    it('[]内でカーソルが最初にある場合は候補を表示（空の検索文字列）', () => {
      const result = analyzeBoardTitleSuggestion('hello [] test', 7);
      
      expect(result.shouldShow).toBe(true);
      expect(result.searchText).toBe('');
      expect(result.bracketStart).toBe(6);
      expect(result.bracketEnd).toBe(7);
    });

    it('[]の外にカーソルがある場合は候補を表示しない', () => {
      const result = analyzeBoardTitleSuggestion('hello [world] test', 15);
      
      expect(result.shouldShow).toBe(false);
      expect(result.searchText).toBe('');
    });

    it('.icon記法の場合は候補を表示しない', () => {
      const result = analyzeBoardTitleSuggestion('hello [user.icon] test', 12);
      
      expect(result.shouldShow).toBe(false);
      expect(result.searchText).toBe('');
    });

    it('複数の[]がある場合、カーソル位置に対応する[]のみを対象とする', () => {
      const result = analyzeBoardTitleSuggestion('[first] and [second] text', 16);
      
      expect(result.shouldShow).toBe(true);
      expect(result.searchText).toBe('sec');
      expect(result.bracketStart).toBe(12);
      expect(result.bracketEnd).toBe(19);
    });

    it('対応する]がない場合は候補を表示しない', () => {
      const result = analyzeBoardTitleSuggestion('hello [world', 10);
      
      expect(result.shouldShow).toBe(false);
      expect(result.searchText).toBe('');
    });
  });

  describe('filterBoardSuggestions (ファジー検索)', () => {
    const mockBoards: Board[] = [
      { id: '1', name: 'テストボード', projectId: 'p1', createdBy: 'user1', createdAt: 1000 },
      { id: '2', name: 'プロジェクト管理', projectId: 'p1', createdBy: 'user1', createdAt: 2000 },
      { id: '3', name: 'Test Board', projectId: 'p1', createdBy: 'user1', createdAt: 3000 },
      { id: '4', name: 'アイデア', projectId: 'p1', createdBy: 'user1', createdAt: 4000 },
      { id: '5', name: 'デザイン', projectId: 'p1', createdBy: 'user1', createdAt: 5000 },
    ];

    it('空文字列の場合は全てのボードを返す', () => {
      const result = filterBoardSuggestions(mockBoards, '');
      expect(result).toEqual(mockBoards);
    });

    it('完全一致で検索する', () => {
      const result = filterBoardSuggestions(mockBoards, 'テストボード');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('テストボード');
    });

    it('部分一致で検索する', () => {
      const result = filterBoardSuggestions(mockBoards, 'テスト');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('テストボード');
    });

    it('英語でも検索できる', () => {
      const result = filterBoardSuggestions(mockBoards, 'test');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(b => b.name.includes('Test'))).toBe(true);
    });

    it('曖昧な検索（タイポ）でも結果を返す', () => {
      const result = filterBoardSuggestions(mockBoards, 'テスr'); // 'テスト'のタイポ
      expect(result.length).toBeGreaterThan(0);
    });

    it('マッチしない場合は空配列を返す', () => {
      const result = filterBoardSuggestions(mockBoards, 'xxxxxxxxx');
      expect(result).toHaveLength(0);
    });

    it('関連性の高い順にソートされる', () => {
      const result = filterBoardSuggestions(mockBoards, 'デ');
      expect(result.length).toBeGreaterThan(0);
      // 'デザイン'は'デ'で始まるので、'アイデア'より上位に来るはず
      if (result.length > 1) {
        const designIndex = result.findIndex(b => b.name === 'デザイン');
        const ideaIndex = result.findIndex(b => b.name === 'アイデア');
        if (designIndex >= 0 && ideaIndex >= 0) {
          expect(designIndex).toBeLessThan(ideaIndex);
        }
      }
    });
  });
});