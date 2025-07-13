import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StickyNote } from '../components/StickyNote';
import { Note } from '../types';

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
});