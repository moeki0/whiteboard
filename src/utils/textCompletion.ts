/**
 * テキスト補完機能のユーティリティ関数
 */

import { Board } from "../types";
import Fuse from "fuse.js";

/**
 * ボード候補のファジー検索フィルタリング
 * @param boards ボード一覧
 * @param searchText 検索文字列
 * @returns フィルタリングされたボード一覧（関連性の高い順）
 */
export function filterBoardSuggestions(
  boards: Board[],
  searchText: string
): Board[] {
  if (!searchText.trim()) {
    return boards;
  }
  
  // Fuseの設定
  const options = {
    keys: ['name'], // 検索対象のフィールド
    threshold: 0.6, // マッチング閾値 (0=完全一致, 1=何でもマッチ)
    distance: 100, // 検索文字列の距離
    includeScore: true, // スコアを含める
    includeMatches: true, // マッチした部分の情報を含める
    minMatchCharLength: 1, // 最小マッチ文字数
  };
  
  const fuse = new Fuse(boards, options);
  const results = fuse.search(searchText);
  
  // スコア順にソートされた結果を返す（マッチ情報も含む）
  return results.map(result => ({
    ...result.item,
    matches: result.matches
  }));
}

/**
 * [の補完機能
 * 新しいコンテンツが[で終わる場合、]を追加して[]に補完する
 * @param oldContent 変更前のコンテンツ
 * @param newContent 変更後のコンテンツ
 * @returns 補完結果 { shouldComplete: boolean, completedContent: string, cursorPosition: number }
 */
export function handleBracketCompletion(
  oldContent: string,
  newContent: string
): { shouldComplete: boolean; completedContent: string; cursorPosition: number } {
  // 入力が増えていて、最後に[が入力された場合
  if (newContent.length > oldContent.length && newContent.endsWith('[')) {
    const completedContent = newContent + ']';
    const cursorPosition = newContent.length; // ]の前の位置
    return {
      shouldComplete: true,
      completedContent,
      cursorPosition
    };
  }
  
  return {
    shouldComplete: false,
    completedContent: newContent,
    cursorPosition: newContent.length
  };
}

/**
 * ボードタイトルの候補表示機能
 * []内でのカーソル位置と入力内容を解析して、候補を表示すべきかを判定
 * @param content テキスト内容
 * @param cursorPosition カーソル位置
 * @returns 候補表示情報 { shouldShow: boolean, searchText: string, bracketStart: number, bracketEnd: number }
 */
export function analyzeBoardTitleSuggestion(
  content: string,
  cursorPosition: number
): { shouldShow: boolean; searchText: string; bracketStart: number; bracketEnd: number } {
  // カーソル位置から前後の[と]を探す
  let bracketStart = -1;
  let bracketEnd = -1;
  
  // カーソル位置から左に向かって[を探す
  for (let i = cursorPosition - 1; i >= 0; i--) {
    if (content[i] === '[') {
      bracketStart = i;
      break;
    }
    if (content[i] === ']') {
      // 先に]が見つかった場合は[]の外にいる
      break;
    }
  }
  
  // カーソル位置から右に向かって]を探す
  for (let i = cursorPosition; i < content.length; i++) {
    if (content[i] === ']') {
      bracketEnd = i;
      break;
    }
    if (content[i] === '[') {
      // 先に[が見つかった場合は無効
      break;
    }
  }
  
  // [と]が両方見つかり、カーソルがその間にある場合
  if (bracketStart !== -1 && bracketEnd !== -1 && bracketStart < cursorPosition && cursorPosition <= bracketEnd) {
    const searchText = content.substring(bracketStart + 1, cursorPosition);
    
    // アイコン記法(.icon)ではない場合のみ候補を表示
    // []内全体の内容を確認する必要がある
    const fullText = content.substring(bracketStart + 1, bracketEnd);
    if (!fullText.includes('.icon')) {
      return {
        shouldShow: true,
        searchText,
        bracketStart,
        bracketEnd
      };
    }
  }
  
  return {
    shouldShow: false,
    searchText: '',
    bracketStart: -1,
    bracketEnd: -1
  };
}