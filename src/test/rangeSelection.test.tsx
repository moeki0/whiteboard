import { describe, test, expect } from "vitest";
import { Note } from "../types";
import { isNoteInSelection, calculateNoteDimensions } from "../utils/noteUtils";

describe("Range Selection", () => {
  const mockUser = {
    uid: "user1",
    displayName: "Test User",
    email: "test@example.com",
  };

  const createMockNote = (id: string, x: number, y: number): Note => ({
    id,
    content: `Note ${id}`,
    x,
    y,
    width: "auto",
    zIndex: 100,
    createdAt: Date.now(),
    userId: mockUser.uid,
    isDragging: false,
    draggedBy: null,
    isEditing: false,
    editedBy: null,
  });

  test("should select notes within range selection bounds", () => {
    // テスト用のモックノート
    const notes = [
      createMockNote("note1", 100, 100),
      createMockNote("note2", 200, 150),
      createMockNote("note3", 300, 200),
      createMockNote("note4", 50, 50),
    ];

    // 範囲選択のテストロジックを検証
    const selectionBounds = { minX: 80, minY: 80, maxX: 220, maxY: 170 };
    
    // 新しい isNoteInSelection 関数を使用
    const selectedNotes = notes.filter(note => isNoteInSelection(note, selectionBounds));

    // 選択されたノートを確認
    console.log("Selected notes:", selectedNotes.map(n => ({ id: n.id, x: n.x, y: n.y })));
    
    // note1 (100,100) と note2 (200,150) が選択されるはず
    // note4 (50,50) も選択範囲に含まれる可能性がある
    expect(selectedNotes.length).toBeGreaterThanOrEqual(2);
    expect(selectedNotes.map(n => n.id)).toContain("note1");
    expect(selectedNotes.map(n => n.id)).toContain("note2");
  });

  test("should accurately calculate note bounds for selection", () => {
    const note = createMockNote("test", 100, 100);
    
    // 新しい calculateNoteDimensions 関数をテスト
    const dimensions = calculateNoteDimensions(note);
    
    // 基本的な付箋の幅は160px
    expect(dimensions.width).toBe(160);
    
    // 高さは最低でも41.5px
    expect(dimensions.height).toBeGreaterThanOrEqual(41.5);
  });

  test("should handle multi-line content in dimension calculation", () => {
    const noteWithMultilineContent = createMockNote("multiline", 100, 100);
    noteWithMultilineContent.content = "Line 1\nLine 2\nLine 3";
    
    const dimensions = calculateNoteDimensions(noteWithMultilineContent);
    
    // 複数行のコンテンツの場合、高さが増加する
    expect(dimensions.height).toBeGreaterThan(41.5);
  });

  test("should handle edge cases in range selection", () => {
    const noteAtBoundary = createMockNote("boundary", 100, 100);
    
    // 境界ギリギリの選択範囲
    const selectionBounds = { minX: 100, minY: 100, maxX: 260, maxY: 200 };
    
    const isSelected = isNoteInSelection(noteAtBoundary, selectionBounds);
    
    // 境界に接している場合も選択されるべき
    expect(isSelected).toBe(true);
  });
});