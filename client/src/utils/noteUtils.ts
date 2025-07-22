import { Note } from "../types";

/**
 * 付箋の実際のサイズを計算する
 * @param note 付箋オブジェクト
 * @returns 付箋の幅と高さ
 */
export function calculateNoteDimensions(note: Note): { width: number; height: number } {
  // 付箋の基本幅（CSSで定義されている値）
  const DEFAULT_WIDTH = 160;
  
  // 付箋の基本高さを計算
  // パディング: 8px (上下)
  // 最小高さ: 41.5px (1行分)
  // 行の高さ: 約20px
  
  const PADDING = 16; // 上下パディング合計
  const MIN_HEIGHT = 41.5;
  const LINE_HEIGHT = 20;
  
  // コンテンツの行数を推定
  const content = note.content || "";
  const lines = content.split("\n");
  const estimatedLines = lines.reduce((total, line) => {
    // 1行の文字数を推定（日本語と英語の混在を考慮）
    const charsPerLine = 20; // 160px / 8px(平均文字幅)
    const lineCount = Math.max(1, Math.ceil(line.length / charsPerLine));
    return total + lineCount;
  }, 0);
  
  const estimatedHeight = Math.max(MIN_HEIGHT, estimatedLines * LINE_HEIGHT + PADDING);
  
  return {
    width: DEFAULT_WIDTH,
    height: estimatedHeight,
  };
}

/**
 * 付箋の境界ボックスを計算する
 * @param note 付箋オブジェクト
 * @returns 付箋の境界ボックス
 */
export function calculateNoteBounds(note: Note): { left: number; top: number; right: number; bottom: number } {
  const { width, height } = calculateNoteDimensions(note);
  
  return {
    left: note.x,
    top: note.y,
    right: note.x + width,
    bottom: note.y + height,
  };
}

/**
 * 範囲選択との交差判定を行う
 * @param note 付箋オブジェクト
 * @param selectionBounds 選択範囲の境界
 * @returns 交差しているかどうか
 */
export function isNoteInSelection(
  note: Note,
  selectionBounds: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  const noteBounds = calculateNoteBounds(note);
  
  return (
    noteBounds.left < selectionBounds.maxX &&
    noteBounds.right > selectionBounds.minX &&
    noteBounds.top < selectionBounds.maxY &&
    noteBounds.bottom > selectionBounds.minY
  );
}

/**
 * DOM要素から実際の付箋のサイズを取得する
 * @param element 付箋のDOM要素
 * @returns 実際の幅と高さ
 */
export function getActualNoteDimensions(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}