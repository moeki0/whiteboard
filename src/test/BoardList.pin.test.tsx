import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BoardList } from '../components/BoardList';
import { MemoryRouter } from 'react-router-dom';
import { User } from '../types';

// Mock Firebase
vi.mock('../config/firebase', () => ({
  rtdb: {}
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn()
}));

// Mock contexts
vi.mock('../contexts/ProjectContext', () => ({
  useProject: () => ({
    updateCurrentProject: vi.fn()
  })
}));

vi.mock('../contexts/SlugContext', () => ({
  useSlug: () => ({
    resolvedProjectId: 'test-project-id'
  })
}));

// Mock utilities
vi.mock('../utils/boardNaming', () => ({
  generateNewBoardName: vi.fn().mockResolvedValue('New Board')
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  customAlphabet: vi.fn(() => () => 'mock-board-id')
}));

describe('BoardList Pin Feature', () => {
  const mockUser: User = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display pinned boards before unpinned boards', async () => {
    const { get, onValue } = await import('firebase/database');
    
    // Create sequential mock responses
    let callCount = 0;
    vi.mocked(get).mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: // project data
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              name: 'Test Project',
              slug: 'test-project'
            })
          });
        case 2: // project boards
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              'board-1': true,
              'board-2': true,
              'board-3': true
            })
          });
        case 3: // board-1 data (pinned)
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              name: 'Board 1',
              createdAt: 1000,
              isPinned: true,
              projectId: 'test-project-id'
            })
          });
        case 4: // board-2 data (unpinned, newer)
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              name: 'Board 2',
              createdAt: 2000,
              isPinned: false,
              projectId: 'test-project-id'
            })
          });
        case 5: // board-3 data (unpinned, oldest)
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              name: 'Board 3',
              createdAt: 500,
              isPinned: false,
              projectId: 'test-project-id'
            })
          });
        default:
          return Promise.resolve({ exists: () => false, val: () => null });
      }
    });

    // Mock onValue for cursors
    vi.mocked(onValue).mockImplementation(() => () => {});

    render(
      <MemoryRouter>
        <BoardList user={mockUser} projectId="test-project-id" />
      </MemoryRouter>
    );

    // Wait for boards to load
    await waitFor(() => {
      expect(screen.getByText('Board 1')).toBeInTheDocument();
      expect(screen.getByText('Board 2')).toBeInTheDocument();
      expect(screen.getByText('Board 3')).toBeInTheDocument();
    });

    // Get the container element using testid
    const boardsGrid = document.querySelector('.boards-grid');
    expect(boardsGrid).toBeTruthy();
    
    // Get all board name elements
    const boardNames = boardsGrid!.querySelectorAll('.board-name');
    
    // Verify we have 3 boards
    expect(boardNames).toHaveLength(3);
    
    // Pinned board (Board 1) should be first
    expect(boardNames[0]).toHaveTextContent('Board 1');
    
    // Unpinned boards should be sorted by date (Board 2 newer than Board 3)
    expect(boardNames[1]).toHaveTextContent('Board 2');
    expect(boardNames[2]).toHaveTextContent('Board 3');
  });
});