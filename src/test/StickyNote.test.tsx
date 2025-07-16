import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StickyNote } from '../components/StickyNote';
import { Note, Board, Project } from '../types';

const mockNote: Note = {
  id: '1',
  content: 'Test note',
  x: 100,
  y: 100,
  color: '#ffeb3b',
  userId: 'user1',
  createdAt: Date.now(),
  zIndex: 1,
  width: 250,
};

const mockBoard: Board = {
  id: 'board1',
  name: 'Test Board',
  createdBy: 'user1',
  createdAt: Date.now(),
  projectId: 'project1',
};

const mockProject: Project = {
  id: 'project1',
  name: 'Test Project',
  createdBy: 'user1',
  createdAt: Date.now(),
  isPublic: false,
  members: {
    user1: {
      role: 'owner',
      displayName: 'Test User',
      email: 'test@example.com',
      joinedAt: Date.now(),
    },
  },
};

const mockProps = {
  note: mockNote,
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  isActive: false,
  isSelected: false,
  onActivate: vi.fn(),
  onStartBulkDrag: vi.fn(),
  currentUserId: 'user1',
  getUserColor: vi.fn(() => '#ff0000'),
  isDraggingMultiple: false,
  board: mockBoard,
  project: mockProject,
};

describe('StickyNote', () => {
  it('renders note content', () => {
    render(<StickyNote {...mockProps} />);
    expect(screen.getByText('Test note')).toBeInTheDocument();
  });

  it('applies correct positioning', () => {
    const { container } = render(<StickyNote {...mockProps} />);
    const noteElement = container.firstChild as HTMLElement;
    expect(noteElement.style.left).toBe('100px');
    expect(noteElement.style.top).toBe('100px');
  });

  describe('新規作成時の機能', () => {
    it('新規作成時（空コンテンツ）に色変更ツールバーが表示される', () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: '' },
        isActive: true
      };
      render(<StickyNote {...newNoteProps} />);
      
      // 色変更ツールバーの存在を確認
      expect(screen.getByRole('toolbar', { name: 'Color selection' })).toBeInTheDocument();
    });

    it('新規作成時（空コンテンツ）にadd meボタンが表示される', () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: '' },
        isActive: true
      };
      render(<StickyNote {...newNoteProps} />);
      
      // add meボタンの存在を確認
      expect(screen.getByRole('button', { name: 'Add me' })).toBeInTheDocument();
    });
  });
});