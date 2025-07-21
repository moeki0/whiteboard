import React from 'react';
import { render, screen } from '@testing-library/react';
import { StickyNote } from '../components/StickyNote';
import { Note, Board, Project } from '../types';
import { vi } from 'vitest';

// モック関数
const mockOnUpdate = vi.fn();
const mockOnDelete = vi.fn();
const mockOnActivate = vi.fn();
const mockOnStartBulkDrag = vi.fn();
const mockGetUserColor = vi.fn(() => '#000000');

const mockBoard: Board = {
  id: 'test-board',
  title: 'Test Board',
  projectId: 'test-project',
  notes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  thumbnailUrl: null,
  isTemplate: false,
  lastModifiedBy: 'test-user',
  lastViewedAt: {},
  scenes: [],
  pinnedBy: {},
  collectionId: null,
  orderInCollection: 0,
  settings: {
    readOnly: false,
    allowNonMembers: false,
    moderation: false,
    hideFromSearch: false,
  },
};

const mockProject: Project = {
  id: 'test-project',
  name: 'Test Project',
  slug: 'test-project',
  description: '',
  members: {},
  settings: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ownerId: 'test-user',
  cosenseProjectName: null,
};

describe('StickyNote YouTube埋め込み機能', () => {
  test('YouTubeのURLが含まれた付箋でiframeが表示される', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.getByTitle('YouTube video');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('YouTube短縮URLでもiframeが表示される', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: 'https://youtu.be/dQw4w9WgXcQ',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.getByTitle('YouTube video');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('YouTubeでないURLではiframeが表示されない', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: 'https://example.com',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.queryByTitle('YouTube video');
    expect(iframe).not.toBeInTheDocument();
  });

  test('*でYouTube動画のサイズが大きくなる', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: '*https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.getByTitle('YouTube video');
    expect(iframe).toHaveStyle('width: 420px');
    expect(iframe).toHaveStyle('height: 236px');
  });

  test('**でYouTube動画がより大きくなる', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: '**https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.getByTitle('YouTube video');
    expect(iframe).toHaveStyle('width: 560px');
    expect(iframe).toHaveStyle('height: 314px');
  });

  test('***でYouTube動画が最大サイズになる', () => {
    const mockNote: Note = {
      id: 'test-note',
      content: '***https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      x: 100,
      y: 100,
      width: 'auto',
      color: 'white',
      userId: 'test-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      textSize: 'medium',
      zIndex: 1,
    };

    render(
      <StickyNote
        note={mockNote}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        isActive={false}
        isSelected={false}
        onActivate={mockOnActivate}
        onStartBulkDrag={mockOnStartBulkDrag}
        currentUserId="test-user"
        getUserColor={mockGetUserColor}
        board={mockBoard}
        project={mockProject}
      />
    );

    const iframe = screen.getByTitle('YouTube video');
    expect(iframe).toHaveStyle('width: 700px');
    expect(iframe).toHaveStyle('height: 393px');
  });
});