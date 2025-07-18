import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { StickyNote } from "../components/StickyNote";
import { Note, Board as BoardType } from "../types";

// Firebase のモック
vi.mock("../config/firebase", () => ({
  rtdb: {},
}));

// firebase/database のモック
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  get: vi.fn(() => Promise.resolve({ exists: () => false })),
}));

const mockBoard: BoardType = {
  id: "test-board-id",
  name: "Test Board",
  createdBy: "test-user-id",
  createdAt: Date.now(),
  projectId: "test-project-id",
};

const mockOnUpdateNote = vi.fn();
const mockOnDeleteNote = vi.fn();
const mockOnMoveNote = vi.fn();
const mockOnResizeNote = vi.fn();
const mockOnFocused = vi.fn();
const mockOnSelectNote = vi.fn();
const mockOnCopyAsData = vi.fn();

describe("StickyNote - 末尾アスタリスクによるサイズ縮小記法", () => {
  const renderStickyNote = (content: string) => {
    const note: Note = {
      id: "test-note-id",
      content,
      position: { x: 100, y: 100 },
      size: { width: 150, height: 100 },
      createdBy: "test-user-id",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      zIndex: 100,
      boardId: "test-board-id",
    };

    return render(
      <StickyNote
        note={note}
        board={mockBoard}
        boardThumbnails={{}}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        onMoveNote={mockOnMoveNote}
        onResizeNote={mockOnResizeNote}
        onSelectNote={mockOnSelectNote}
        onCopyAsData={mockOnCopyAsData}
        isActive={false}
        isSelected={false}
        isMultiSelectMode={false}
        shouldFocus={false}
        onFocused={mockOnFocused}
        nextZIndex={101}
        canEditNote={true}
        viewPosition={{ x: 0, y: 0 }}
        viewZoom={1}
      />
    );
  };

  it("通常のテキストは標準サイズで表示される", () => {
    const { container } = renderStickyNote("通常のテキスト");
    
    const stickyNote = container.querySelector(".sticky-note");
    expect(stickyNote).toBeInTheDocument();
    
    // デフォルトのフォントサイズ（13px）とpadding（10px）が適用されることを確認
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    expect(computedStyle.fontSize).toBe("13px");
    expect(computedStyle.padding).toBe("10px");
  });

  it("末尾に*1つで少し小さくなる", () => {
    const { container } = renderStickyNote("小さいテキスト*");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 13px → 11px (標準より2px小さい)
    expect(computedStyle.fontSize).toBe("11px");
    // padding も調整される（11pxなので6pxになる）
    expect(computedStyle.padding).toBe("6px");
    
    // line-heightも調整される（11pxなので1.2になる）
    const contentDiv = container.querySelector("div[style*='lineHeight']");
    if (contentDiv) {
      const contentStyle = window.getComputedStyle(contentDiv as Element);
      // line-heightは数値で返される場合があるため、範囲チェック
      const lineHeight = parseFloat(contentStyle.lineHeight);
      expect(lineHeight).toBeGreaterThanOrEqual(1.2);
      expect(lineHeight).toBeLessThan(1.3);
    }
  });

  it("末尾に**2つでさらに小さくなる", () => {
    const { container } = renderStickyNote("さらに小さいテキスト**");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 13px → 9px (標準より4px小さい)
    expect(computedStyle.fontSize).toBe("9px");
  });

  it("末尾に***3つでもっと小さくなる", () => {
    const { container } = renderStickyNote("もっと小さいテキスト***");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 13px → 7px (標準より6px小さい)
    expect(computedStyle.fontSize).toBe("7px");
  });

  it("最小サイズ制限がある（5px以下にはならない）", () => {
    const { container } = renderStickyNote("極小テキスト********");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 最小5pxまで
    expect(computedStyle.fontSize).toBe("5px");
    // 極小サイズでは最小padding（4px）が適用される
    expect(computedStyle.padding).toBe("4px");
    
    // 極小サイズでは小さなline-height（1.1）が適用される
    const contentDiv = container.querySelector("div[style*='lineHeight']");
    if (contentDiv) {
      const contentStyle = window.getComputedStyle(contentDiv as Element);
      const lineHeight = parseFloat(contentStyle.lineHeight);
      expect(lineHeight).toBeGreaterThanOrEqual(1.1);
      expect(lineHeight).toBeLessThan(1.2);
    }
  });

  it("末尾以外のアスタリスクは影響しない", () => {
    const { container } = renderStickyNote("テキスト*の中に*アスタリスク");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 末尾にアスタリスクがないので標準サイズ
    expect(computedStyle.fontSize).toBe("13px");
  });

  it("複数行の場合は全体に適用される", () => {
    const { container } = renderStickyNote("1行目\n2行目\n3行目**");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 全体が小さくなる
    expect(computedStyle.fontSize).toBe("9px");
  });

  it("先頭のアスタリスク（拡大記法）と末尾のアスタリスク（縮小記法）が共存する場合", () => {
    const { container } = renderStickyNote("*大きいテキスト*");
    
    const stickyNote = container.querySelector(".sticky-note");
    const computedStyle = window.getComputedStyle(stickyNote as Element);
    // 末尾の*による縮小が優先される（13px → 11px）
    expect(computedStyle.fontSize).toBe("11px");
    
    // 先頭の*は拡大記法として処理されず、末尾の*も表示されない
    const textContent = container.textContent;
    expect(textContent).toContain("大きいテキスト");
  });
});