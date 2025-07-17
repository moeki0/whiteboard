import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardSettings } from '../components/BoardSettings';
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
  remove: vi.fn()
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ boardId: 'test-board-id' })
  };
});

describe('BoardSettings Pin Feature', () => {
  const mockUser: User = {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display pin board option for project members', async () => {
    const { get } = await import('firebase/database');
    
    // Mock board and project data
    vi.mocked(get)
      .mockResolvedValueOnce({
        // First call: board data
        exists: () => true,
        val: () => ({
          id: 'test-board-id',
          name: 'Test Board',
          projectId: 'test-project-id',
          createdBy: 'test-user-id',
          createdAt: Date.now(),
          isPinned: false
        })
      })
      .mockResolvedValueOnce({
        // Second call: project data
        exists: () => true,
        val: () => ({
          name: 'Test Project',
          members: {
            'test-user-id': {
              role: 'owner',
              displayName: 'Test User',
              email: 'test@example.com'
            }
          }
        })
      });

    render(
      <MemoryRouter initialEntries={['/boards/test-board-id/settings']}>
        <BoardSettings user={mockUser} />
      </MemoryRouter>
    );

    // Wait for loading to complete and check for pin option
    expect(await screen.findByText('Pin Board to Top')).toBeInTheDocument();
    expect(screen.getByText('Pin this board to the top of the board list')).toBeInTheDocument();
  });

  it('should show unpin option when board is already pinned', async () => {
    const { get } = await import('firebase/database');
    
    // Mock board data with isPinned: true
    vi.mocked(get)
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          id: 'test-board-id',
          name: 'Test Board',
          projectId: 'test-project-id',
          createdBy: 'test-user-id',
          createdAt: Date.now(),
          isPinned: true
        })
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          name: 'Test Project',
          members: {
            'test-user-id': {
              role: 'owner',
              displayName: 'Test User',
              email: 'test@example.com'
            }
          }
        })
      });

    render(
      <MemoryRouter initialEntries={['/boards/test-board-id/settings']}>
        <BoardSettings user={mockUser} />
      </MemoryRouter>
    );

    // Should show unpin option
    expect(await screen.findByText('Unpin Board')).toBeInTheDocument();
    expect(screen.getByText('Remove this board from the top of the board list')).toBeInTheDocument();
  });
});