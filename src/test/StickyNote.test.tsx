import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StickyNote } from "../components/StickyNote";
import { Note, Board, Project } from "../types";

const mockNote: Note = {
  id: "1",
  content: "Test note",
  x: 100,
  y: 100,
  color: "#ffeb3b",
  userId: "user1",
  createdAt: Date.now(),
  zIndex: 1,
  width: 250,
};

const mockBoard: Board = {
  id: "board1",
  name: "Test Board",
  createdBy: "user1",
  createdAt: Date.now(),
  projectId: "project1",
};

const mockProject: Project = {
  id: "project1",
  slug: "slug",
  name: "Test Project",
  createdBy: "user1",
  createdAt: Date.now(),
  isPublic: false,
  members: {
    user1: {
      role: "owner",
      displayName: "Test User",
      email: "test@example.com",
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
  currentUserId: "user1",
  getUserColor: vi.fn(() => "#ff0000"),
  isDraggingMultiple: false,
  board: mockBoard,
  project: mockProject,
};

describe("StickyNote", () => {
  it("renders note content", () => {
    render(<StickyNote {...mockProps} />);
    expect(screen.getByText("Test note")).toBeInTheDocument();
  });

  it("applies correct positioning", () => {
    const { container } = render(<StickyNote {...mockProps} />);
    const noteElement = container.firstChild as HTMLElement;
    expect(noteElement.style.left).toBe("100px");
    expect(noteElement.style.top).toBe("100px");
  });

  describe("新規作成時の機能", () => {
    it("新規作成時（空コンテンツ）の場合のコンポーネントが正常に動作する", () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: "" },
        isActive: true,
      };

      const { container } = render(<StickyNote {...newNoteProps} />);

      // 空のコンテンツでも正常にレンダリングされる
      expect(container.querySelector(".sticky-note")).toBeInTheDocument();
      expect(container.querySelector(".note-content")).toBeInTheDocument();
    });

    it("新規作成時（空コンテンツ）でスタイルが正しく適用される", () => {
      const newNoteProps = {
        ...mockProps,
        note: { ...mockNote, content: "" },
        isActive: true,
      };

      const { container } = render(<StickyNote {...newNoteProps} />);
      const noteElement = container.querySelector(
        ".sticky-note"
      ) as HTMLElement;

      expect(noteElement.style.left).toBe("100px");
      expect(noteElement.style.top).toBe("100px");
      expect(noteElement.classList.contains("active")).toBe(true);
    });
  });

  describe("画像記法のパース処理", () => {
    it("[name.icon*7]記法が正しくパースされて7個の画像要素を生成する", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[moeki.icon*7]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が7個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(7);

      // 各画像のalt属性が正しく設定されていることを確認
      images.forEach((img) => {
        expect(img.getAttribute("alt")).toBe("moeki thumbnail");
      });
    });

    it("[name.icon*3]記法が正しくパースされて3個の画像要素を生成する", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[test.icon*3]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が3個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(3);

      // 各画像のalt属性が正しく設定されていることを確認
      images.forEach((img) => {
        expect(img.getAttribute("alt")).toBe("test thumbnail");
      });
    });

    it("[name.icon]記法（*なし）が正しくパースされて1個の画像要素を生成する", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[moeki.icon]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が1個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(1);

      // 画像のalt属性が正しく設定されていることを確認
      expect(images[0].getAttribute("alt")).toBe("moeki thumbnail");
    });

    it("複数の画像記法が混在している場合も正しくパースされる", () => {
      const noteWithIcon = {
        ...mockNote,
        content:
          "[moeki.icon*2] テキスト [test.icon*3] 他のテキスト [sample.icon]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が2+3+1=6個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(6);
    });

    it("画像記法とテキストが混在している場合も正しく表示される", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "テキスト前 [moeki.icon*2] テキスト後",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が2個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(2);

      // テキストも含まれていることを確認
      expect(container.textContent).toContain("テキスト前");
      expect(container.textContent).toContain("テキスト後");
    });

    it("画像要素のsrc属性が正しく設定されている", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[moeki.icon*2]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が2個生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(2);

      // 各画像のsrc属性が設定されていることを確認（#でないこと）
      images.forEach((img) => {
        const src = img.getAttribute("src");
        expect(src).not.toBe("#");
        expect(src).not.toBe("");
        expect(src).not.toBeNull();
        // デフォルトのSVGプレースホルダーまたは実際のサムネイルURLが設定されている
        expect(src).toMatch(/^(data:image\/svg\+xml|https?:\/\/)/);
      });
    });

    it("デバッグ: 画像のsrc属性の値を確認する", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[moeki.icon*1]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(1);

      const src = images[0].getAttribute("src");

      // src属性が有効な値であることを確認
      expect(src).toBeTruthy();
      expect(src).not.toBe("#");
    });
  });

  describe("[name.img]記法のサイズ処理", () => {
    it("[board.img]記法が通常サイズで表示される", () => {
      const noteWithImage = {
        ...mockNote,
        content: "[board.img]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithImage} />
      );

      // ThumbnailImage要素が生成されることを確認
      const thumbnailImage = container.querySelector('.inline-block');
      expect(thumbnailImage).toBeInTheDocument();
      
      // 通常サイズのスタイルが適用されることを確認
      const computedStyle = window.getComputedStyle(thumbnailImage as Element);
      expect(computedStyle.width).toBe('200px');
      expect(computedStyle.height).toBe('150px');
    });

    it("*[board.img]記法が大きなサイズで表示される", () => {
      const noteWithImage = {
        ...mockNote,
        content: "*[board.img]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithImage} />
      );

      // ThumbnailImage要素が生成されることを確認
      const thumbnailImage = container.querySelector('.inline-block');
      expect(thumbnailImage).toBeInTheDocument();
      
      // 大きなサイズのスタイルが適用されることを確認
      const computedStyle = window.getComputedStyle(thumbnailImage as Element);
      expect(computedStyle.width).toBe('400px');
      expect(computedStyle.height).toBe('300px');
    });

    it("**[board.img]記法がより大きなサイズで表示される", () => {
      const noteWithImage = {
        ...mockNote,
        content: "**[board.img]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithImage} />
      );

      // ThumbnailImage要素が生成されることを確認
      const thumbnailImage = container.querySelector('.inline-block');
      expect(thumbnailImage).toBeInTheDocument();
      
      // さらに大きなサイズのスタイルが適用されることを確認
      const computedStyle = window.getComputedStyle(thumbnailImage as Element);
      expect(computedStyle.width).toBe('600px');
      expect(computedStyle.height).toBe('450px');
    });

    it("複数のアスタリスクが付いた場合の最大サイズ制限", () => {
      const noteWithImage = {
        ...mockNote,
        content: "*******[board.img]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithImage} />
      );

      // ThumbnailImage要素が生成されることを確認
      const thumbnailImage = container.querySelector('.inline-block');
      expect(thumbnailImage).toBeInTheDocument();
      
      // 最大サイズ制限が適用されることを確認（例：1600px × 1200px）
      const computedStyle = window.getComputedStyle(thumbnailImage as Element);
      expect(computedStyle.width).toBe('1600px');
      expect(computedStyle.height).toBe('1200px');
    });
  });

  describe("リンク記法のパース処理", () => {
    it("[name.icon]記法はリンクではなくアイコンとして処理される", () => {
      const noteWithIcon = {
        ...mockNote,
        content: "[moeki.icon]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithIcon} />
      );

      // img要素が生成されることを確認
      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(1);

      // リンクスタイルのspan要素は存在しないことを確認
      const linkElement = container.querySelector(
        'span[style*="color: #0066cc"]'
      );
      expect(linkElement).not.toBeInTheDocument();
    });

    it("デバッグ: リンク記法の処理結果を確認する", () => {
      const noteWithLink = {
        ...mockNote,
        content: "[Bit Journey, Inc.]",
      };

      const { container } = render(
        <StickyNote {...mockProps} note={noteWithLink} />
      );
      expect(container.textContent).toContain("Bit Journey, Inc.");
    });
  });
});
