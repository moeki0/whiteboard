import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase Database のモック
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn()
}));

// Firebase のモック
vi.mock('../config/firebase', () => ({
  rtdb: {}
}));

import { exportProjectData, exportBoardData } from '../utils/exportData';
import { get } from 'firebase/database';

describe('exportData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportBoardData', () => {
    it('should export board data with notes and arrows', async () => {
      const mockBoardData = {
        id: 'board1',
        name: 'Test Board',
        createdBy: 'user1',
        createdAt: 1234567890,
        projectId: 'project1'
      };

      const mockNotes = {
        note1: {
          type: 'note',
          content: 'Test note',
          x: 100,
          y: 200,
          color: 'yellow',
          userId: 'user1',
          createdAt: 1234567890,
          zIndex: 1
        }
      };

      const mockArrows = {
        arrow1: {
          type: 'arrow',
          startNoteId: 'note1',
          endNoteId: 'note2',
          userId: 'user1',
          createdAt: 1234567890,
          zIndex: 2
        }
      };

      const mockGet = vi.mocked(get);
      mockGet
        .mockResolvedValueOnce({ exists: () => true, val: () => mockBoardData })
        .mockResolvedValueOnce({ exists: () => true, val: () => mockNotes })
        .mockResolvedValueOnce({ exists: () => true, val: () => mockArrows })
        .mockResolvedValueOnce({ exists: () => false, val: () => null }); // groups

      const result = await exportBoardData('board1');

      expect(result).toEqual({
        board: mockBoardData,
        notes: [{ 
          id: 'note1', 
          ...mockNotes.note1,
          x: 2500, // 100 + 2400
          y: 2600  // 200 + 2400
        }],
        arrows: [{ id: 'arrow1', ...mockArrows.arrow1 }],
        groups: [],
        exportedAt: expect.any(String),
        version: '1.0.0',
        env: 'turtle'
      });
    });
  });
});