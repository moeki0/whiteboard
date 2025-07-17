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
    it('新規作成時（空コンテンツ）の場合のコンポーネントが正常に動作する', () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: '' },
        isActive: true
      };
      
      const { container } = render(<StickyNote {...newNoteProps} />);
      
      // 空のコンテンツでも正常にレンダリングされる
      expect(container.querySelector('.sticky-note')).toBeInTheDocument();
      expect(container.querySelector('.note-content')).toBeInTheDocument();
    });

    it('新規作成時（空コンテンツ）でスタイルが正しく適用される', () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: '' },
        isActive: true
      };
      
      const { container } = render(<StickyNote {...newNoteProps} />);
      const noteElement = container.querySelector('.sticky-note') as HTMLElement;
      
      expect(noteElement.style.left).toBe('100px');
      expect(noteElement.style.top).toBe('100px');
      expect(noteElement.classList.contains('active')).toBe(true);
    });
  });

  describe('画像記法のパース処理', () => {
    it('[name.icon*7]記法が正しくパースされて7個の画像要素を生成する', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon*7]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が7個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(7);
      
      // 各画像のalt属性が正しく設定されていることを確認
      images.forEach(img => {
        expect(img.getAttribute('alt')).toBe('moeki thumbnail');
      });
    });

    it('[name.icon*3]記法が正しくパースされて3個の画像要素を生成する', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[test.icon*3]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が3個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(3);
      
      // 各画像のalt属性が正しく設定されていることを確認
      images.forEach(img => {
        expect(img.getAttribute('alt')).toBe('test thumbnail');
      });
    });

    it('[name.icon]記法（*なし）が正しくパースされて1個の画像要素を生成する', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が1個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      
      // 画像のalt属性が正しく設定されていることを確認
      expect(images[0].getAttribute('alt')).toBe('moeki thumbnail');
    });

    it('複数の画像記法が混在している場合も正しくパースされる', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon*2] テキスト [test.icon*3] 他のテキスト [sample.icon]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が2+3+1=6個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(6);
    });

    it('画像記法とテキストが混在している場合も正しく表示される', () => {
      const noteWithIcon = {
        ...mockNote,
        content: 'テキスト前 [moeki.icon*2] テキスト後'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が2個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
      
      // テキストも含まれていることを確認
      expect(container.textContent).toContain('テキスト前');
      expect(container.textContent).toContain('テキスト後');
    });

    it('画像要素のsrc属性が正しく設定されている', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon*2]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が2個生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
      
      // 各画像のsrc属性が設定されていることを確認（#でないこと）
      images.forEach(img => {
        const src = img.getAttribute('src');
        expect(src).not.toBe('#');
        expect(src).not.toBe('');
        expect(src).not.toBeNull();
        // デフォルトのSVGプレースホルダーまたは実際のサムネイルURLが設定されている
        expect(src).toMatch(/^(data:image\/svg\+xml|https?:\/\/)/);
      });
    });

    it('デバッグ: 画像のsrc属性の値を確認する', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon*1]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      
      const src = images[0].getAttribute('src');
      console.log('画像のsrc属性:', src);
      
      // src属性が有効な値であることを確認
      expect(src).toBeTruthy();
      expect(src).not.toBe('#');
    });
  });

  describe('リンク記法のパース処理', () => {
    it('[page title]記法が正しくパースされてリンクスタイルが適用される', () => {
      const noteWithLink = {
        ...mockNote,
        content: '[page title]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithLink} />);
      
      // リンクスタイルが適用されたspan要素が存在することを確認
      const linkElement = container.querySelector('span[style*="color: #0066cc"]');
      expect(linkElement).toBeInTheDocument();
      expect(linkElement).toHaveTextContent('page title');
    });

    it('[Bit Journey, Inc.]記法（ドット付き）が正しくパースされてリンクスタイルが適用される', () => {
      const noteWithLink = {
        ...mockNote,
        content: '[Bit Journey, Inc.]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithLink} />);
      
      // リンクスタイルが適用されたspan要素が存在することを確認
      const linkElement = container.querySelector('span[style*="color: #0066cc"]');
      expect(linkElement).toBeInTheDocument();
      expect(linkElement).toHaveTextContent('Bit Journey, Inc.');
      
      // 下線が適用されていることを確認
      expect(linkElement).toHaveStyle('text-decoration: underline');
    });

    it('[name.icon]記法はリンクではなくアイコンとして処理される', () => {
      const noteWithIcon = {
        ...mockNote,
        content: '[moeki.icon]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithIcon} />);
      
      // img要素が生成されることを確認
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      
      // リンクスタイルのspan要素は存在しないことを確認
      const linkElement = container.querySelector('span[style*="color: #0066cc"]');
      expect(linkElement).not.toBeInTheDocument();
    });

    it('複数のリンク記法が混在している場合も正しくパースされる', () => {
      const noteWithLinks = {
        ...mockNote,
        content: '[page 1] と [Bit Journey, Inc.] と [another.page] のリンク'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithLinks} />);
      
      // リンクスタイルが適用されたspan要素が複数存在することを確認
      const linkElements = container.querySelectorAll('span[style*="color: #0066cc"]');
      expect(linkElements.length).toBeGreaterThanOrEqual(3);
    });

    it('リンクとアイコンが混在している場合も正しく区別される', () => {
      const noteWithMixed = {
        ...mockNote,
        content: '[page title] と [moeki.icon] と [Bit Journey, Inc.]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithMixed} />);
      
      // img要素が1個（アイコン用）
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      
      // リンクスタイルのspan要素が2個（リンク用）
      const linkElements = container.querySelectorAll('span[style*="color: #0066cc"]');
      expect(linkElements.length).toBeGreaterThanOrEqual(2);
    });

    it('デバッグ: リンク記法の処理結果を確認する', () => {
      const noteWithLink = {
        ...mockNote,
        content: '[Bit Journey, Inc.]'
      };
      
      const { container } = render(<StickyNote {...mockProps} note={noteWithLink} />);
      
      console.log('HTML内容:', container.innerHTML);
      
      // リンクスタイルが適用されたspan要素を探す（青色 #0066cc）
      const blueLinkElement = container.querySelector('span[style*="color: rgb(0, 102, 204)"]');
      console.log('青色リンク要素:', blueLinkElement);
      
      // グレー色のspan要素を探す（#666）
      const greyElement = container.querySelector('span[style*="color: rgb(102, 102, 102)"]');
      console.log('グレー要素:', greyElement);
      
      // 全体のテキストコンテンツを確認
      console.log('全体のテキスト:', container.textContent);
      expect(container.textContent).toContain('Bit Journey, Inc.');
    });
  });
});