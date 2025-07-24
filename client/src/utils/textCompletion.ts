/**
 * テキスト補完機能のユーティリティ関数
 */

import { Board } from "../types";
import Fuse from "fuse.js";
import { searchScrapboxTitles, ScrapboxSearchResult } from "./scrapboxApi";

/**
 * 統合された候補アイテムの型
 */
export interface SuggestionItem {
  title: string;
  type: "board" | "scrapbox";
  boardId?: string;
  url?: string;
  matches?: any;
}

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
    keys: ["name"], // 検索対象のフィールド
    threshold: 0.6, // マッチング閾値 (0=完全一致, 1=何でもマッチ)
    distance: 100, // 検索文字列の距離
    includeScore: true, // スコアを含める
    includeMatches: true, // マッチした部分の情報を含める
    minMatchCharLength: 1, // 最小マッチ文字数
  };

  const fuse = new Fuse(boards, options);
  const results = fuse.search(searchText);

  // スコア順にソートされた結果を返す（マッチ情報も含む）
  return results.map((result) => ({
    ...result.item,
    matches: result.matches,
  }));
}

/**
 * Scrapboxページのファジー検索フィルタリング
 * @param pages Scrapboxページ一覧
 * @param searchText 検索文字列
 * @returns フィルタリングされたページ一覧（関連性の高い順）
 */
export function filterScrapboxSuggestions(
  pages: ScrapboxSearchResult[],
  searchText: string
): ScrapboxSearchResult[] {
  if (!searchText.trim()) {
    return pages;
  }

  // Fuseの設定（Scrapbox用に調整）
  const options = {
    keys: ["title"], // 検索対象のフィールド
    threshold: 0.4, // より厳しい閾値（より関連性の高いものを表示）
    distance: 50, // 短い距離でマッチング
    includeScore: true, // スコアを含める
    includeMatches: true, // マッチした部分の情報を含める
    minMatchCharLength: 1, // 最小マッチ文字数
    ignoreLocation: true, // 位置を無視（全体的なマッチを重視）
  };

  const fuse = new Fuse(pages, options);
  const results = fuse.search(searchText);

  // スコア順にソートされた結果を返す（マッチ情報も含む）
  return results.map((result) => ({
    ...result.item,
    matches: result.matches,
  }));
}

/**
 * ボードとScrapboxページの統合候補を取得
 * @param boards ボード一覧
 * @param searchText 検索文字列
 * @param scrapboxProjectName Scrapboxプロジェクト名（オプション）
 * @returns 統合された候補一覧
 */
export async function getCombinedSuggestions(
  boards: Board[],
  searchText: string,
  scrapboxProjectName?: string
): Promise<SuggestionItem[]> {
  const suggestions: SuggestionItem[] = [];

  // ボード候補を追加
  const filteredBoards = filterBoardSuggestions(boards, searchText);

  suggestions.push(
    ...filteredBoards.map((board) => ({
      title: String(board.name || ""),
      type: "board" as const,
      boardId: board.id,
      matches: (board as any).matches,
    }))
  );

  // Scrapbox候補を追加（プロジェクト名が指定されている場合のみ）
  if (scrapboxProjectName && searchText.trim()) {
    try {
      // まず広範囲でScrapboxページを取得（検索文字列の最初の文字など）
      const broadSearchText =
        searchText.length > 2 ? searchText.substring(0, 2) : searchText;
      const scrapboxResults = await searchScrapboxTitles(
        scrapboxProjectName,
        broadSearchText
      );

      // クライアントサイドで詳細なファジー検索を実行
      const filteredResults = filterScrapboxSuggestions(
        scrapboxResults,
        searchText
      );

      suggestions.push(
        ...filteredResults.map((result) => ({
          title: String(result.title || ""),
          type: "scrapbox" as const,
          url: result.url,
          matches: result.matches,
        }))
      );
    } catch (error) {
      console.error(
        "[Combined Suggestions] Failed to fetch Scrapbox suggestions:",
        error
      );
    }
  }

  // 候補を種類別に分離してソート
  const boardSuggestions = suggestions.filter((s) => s.type === "board");
  const scrapboxSuggestions = suggestions.filter((s) => s.type === "scrapbox");

  // ボード候補を優先し、その後にScrapbox候補を表示
  const sortedSuggestions = [...boardSuggestions, ...scrapboxSuggestions];

  return sortedSuggestions;
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
): {
  shouldComplete: boolean;
  completedContent: string;
  cursorPosition: number;
} {
  // null/undefinedチェック
  if (!oldContent) oldContent = "";
  if (!newContent) newContent = "";

  // 入力が増えていて、最後に[が入力された場合
  if (newContent.length > oldContent.length && newContent.endsWith("[")) {
    const completedContent = newContent + "]";
    const cursorPosition = newContent.length; // ]の前の位置
    return {
      shouldComplete: true,
      completedContent,
      cursorPosition,
    };
  }

  return {
    shouldComplete: false,
    completedContent: newContent,
    cursorPosition: newContent.length,
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
): {
  shouldShow: boolean;
  searchText: string;
  bracketStart: number;
  bracketEnd: number;
} {
  // カーソル位置から前後の[と]を探す
  let bracketStart = -1;
  let bracketEnd = -1;

  // カーソル位置から左に向かって[を探す
  for (let i = cursorPosition - 1; i >= 0; i--) {
    if (content[i] === "[") {
      bracketStart = i;
      break;
    }
    if (content[i] === "]") {
      // 先に]が見つかった場合は[]の外にいる
      break;
    }
  }

  // カーソル位置から右に向かって]を探す
  for (let i = cursorPosition; i < content.length; i++) {
    if (content[i] === "]") {
      bracketEnd = i;
      break;
    }
    if (content[i] === "[") {
      // 先に[が見つかった場合は無効
      break;
    }
  }

  // [と]が両方見つかり、カーソルがその間にある場合
  if (
    bracketStart !== -1 &&
    bracketEnd !== -1 &&
    bracketStart < cursorPosition &&
    cursorPosition <= bracketEnd
  ) {
    const searchText = content.substring(bracketStart + 1, cursorPosition);

    // アイコン記法(.icon)ではない場合のみ候補を表示
    // []内全体の内容を確認する必要がある
    const fullText = content.substring(bracketStart + 1, bracketEnd);
    if (!fullText.includes(".icon")) {
      return {
        shouldShow: true,
        searchText,
        bracketStart,
        bracketEnd,
      };
    }
  }

  return {
    shouldShow: false,
    searchText: "",
    bracketStart: -1,
    bracketEnd: -1,
  };
}
