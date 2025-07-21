import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { StickyNote } from '../components/StickyNote';
import { Note, Board, Project } from '../types';

// Mock external dependencies
vi.mock('../utils/userProfile', () => ({
  getUserProfileByUsername: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock('../utils/boardInfo', () => ({
  getBoardInfo: vi.fn(),
}));

vi.mock('../hooks/useProjectBoards', () => ({
  useProjectBoards: () => ({ boards: [] }),
}));

vi.mock('../hooks/useCombinedSuggestions', () => ({
  useCombinedSuggestions: () => ({
    suggestions: [],
    isLoading: false,
    error: null,
  }),
}));

describe('StickyNote iframe埋め込み機能', () => {
  const mockNote: Note = {
    id: 'test-note-1',
    content: '',
    x: 100,
    y: 100,
    userId: 'user1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    color: 'white',
    textSize: 'medium',
  };

  const mockBoard: Board = {
    id: 'test-board',
    title: 'Test Board',
    projectId: 'test-project',
  };

  const mockProject: Project = {
    id: 'test-project',
    name: 'Test Project',
    slug: 'test-project',
    ownerId: 'user1',
    members: {
      user1: { role: 'owner', addedAt: Date.now() }
    },
  };

  const defaultProps = {
    note: mockNote,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    isActive: false,
    isSelected: false,
    onActivate: vi.fn(),
    onStartBulkDrag: vi.fn(),
    currentUserId: 'user1',
    getUserColor: vi.fn(() => '#ff0000'),
    board: mockBoard,
    project: mockProject,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('iframeタグがそのまま貼り付けられた場合も埋め込みとして表示される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const iframeTag = `<iframe src="${googleDocUrl}"></iframe>`;
    const noteWithIframe = {
      ...mockNote,
      content: iframeTag,
    };

    render(<StickyNote {...defaultProps} note={noteWithIframe} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', googleDocUrl);
  });

  it('Google DocumentのURLがiframeとして表示される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const noteWithGoogleDoc = {
      ...mockNote,
      content: googleDocUrl,
    };

    render(<StickyNote {...defaultProps} note={noteWithGoogleDoc} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', googleDocUrl);
  });

  it('iframe に適切な属性が設定される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const noteWithGoogleDoc = {
      ...mockNote,
      content: googleDocUrl,
    };

    render(<StickyNote {...defaultProps} note={noteWithGoogleDoc} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toHaveStyle({
      width: '240px',
      height: '320px',
    });
  });

  it('アスタリスクでiframeのサイズが調整される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const noteWithLargeGoogleDoc = {
      ...mockNote,
      content: `**${googleDocUrl}`,
    };

    render(<StickyNote {...defaultProps} note={noteWithLargeGoogleDoc} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toHaveStyle({
      width: '346px',  // 240 * 1.2^2 = 345.6 → 346
      height: '461px', // 320 * 1.2^2 = 460.8 → 461
    });
  });

  it('Google Docsの埋め込みURL以外は通常テキストとして表示される', () => {
    const regularGoogleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/edit';
    const noteWithRegularGoogleDoc = {
      ...mockNote,
      content: regularGoogleDocUrl,
    };

    render(<StickyNote {...defaultProps} note={noteWithRegularGoogleDoc} />);

    expect(screen.queryByTitle('Google Document')).not.toBeInTheDocument();
    expect(screen.getByText(regularGoogleDocUrl)).toBeInTheDocument();
  });

  it('Google Spreadsheetsの埋め込みURLがiframeとして表示される', () => {
    const googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQQm8sJ9X7K2L1B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G4H5I6/pubhtml?widget=true&headers=false';
    const noteWithGoogleSheets = {
      ...mockNote,
      content: googleSheetsUrl,
    };

    render(<StickyNote {...defaultProps} note={noteWithGoogleSheets} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', googleSheetsUrl);
  });

  it('Google Slidesの埋め込みURLがiframeとして表示される', () => {
    const googleSlidesUrl = 'https://docs.google.com/presentation/d/e/2PACX-1vQQm8sJ9X7K2L1B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G4H5I6/embed?start=false&loop=false&delayms=3000';
    const noteWithGoogleSlides = {
      ...mockNote,
      content: googleSlidesUrl,
    };

    render(<StickyNote {...defaultProps} note={noteWithGoogleSlides} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', googleSlidesUrl);
  });

  it('複雑なiframeタグ（複数属性付き）も正しく処理される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const complexIframeTag = `<iframe src="${googleDocUrl}" width="640" height="480" frameborder="0" marginheight="0" marginwidth="0"></iframe>`;
    const noteWithComplexIframe = {
      ...mockNote,
      content: complexIframeTag,
    };

    render(<StickyNote {...defaultProps} note={noteWithComplexIframe} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', googleDocUrl);
  });

  it('アスタリスク付きiframeタグでサイズが調整される', () => {
    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vR1ITGN8ZeGVM-oFb5NjwIvLHgrJB-6oEywORxx99E-z6oaChdLIP9Vz-NW6FCcBfgEQ8QF0PTwxp8V/pub?embedded=true';
    const iframeTag = `<iframe src="${googleDocUrl}"></iframe>`;
    const noteWithLargeIframe = {
      ...mockNote,
      content: `**${iframeTag}`,
    };

    render(<StickyNote {...defaultProps} note={noteWithLargeIframe} />);

    const iframe = screen.getByTitle('Google Document');
    expect(iframe).toHaveStyle({
      width: '346px',  // 240 * 1.2^2 = 345.6 → 346
      height: '461px', // 320 * 1.2^2 = 460.8 → 461
    });
  });

  it('Google Document以外のiframeは通常のテキストとして表示される', () => {
    const otherIframeTag = `<iframe src="https://example.com/embed"></iframe>`;
    const noteWithOtherIframe = {
      ...mockNote,
      content: otherIframeTag,
    };

    render(<StickyNote {...defaultProps} note={noteWithOtherIframe} />);

    expect(screen.queryByTitle('Google Document')).not.toBeInTheDocument();
    // HTMLタグが含まれているので、部分的なテキストで確認
    expect(screen.getByText(/iframe src/)).toBeInTheDocument();
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });
});