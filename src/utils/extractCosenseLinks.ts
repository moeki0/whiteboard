/**
 * テキストからCosenseページのリンクを抽出する
 */

export interface CosenseLink {
  name: string;
  url: string;
}

/**
 * テキストからCosenseページのリンクを抽出
 * @param content テキストコンテンツ
 * @param cosenseProjectName Cosenseプロジェクト名
 * @returns Cosenseページのリンク一覧
 */
export function extractCosenseLinks(
  content: string,
  cosenseProjectName?: string
): CosenseLink[] {
  if (!cosenseProjectName) {
    return [];
  }

  const links: CosenseLink[] = [];
  
  // [title] 記法を検索（.iconや.imgではないもの）
  const titlePattern = /\[([^\]]+)\](?!\.icon)(?!\.img)/g;
  let match;

  while ((match = titlePattern.exec(content)) !== null) {
    const title = match[1].trim();
    
    // 空文字列、URL、画像記法は除外
    if (!title || title.startsWith('http') || title.startsWith('image:')) {
      continue;
    }

    // Cosenseページのリンクを生成
    const cosenseUrl = `https://scrapbox.io/${cosenseProjectName}/${encodeURIComponent(title)}`;
    
    links.push({
      name: title,
      url: cosenseUrl
    });
  }

  // 重複を除去
  const uniqueLinks = links.filter((link, index, self) => 
    index === self.findIndex(l => l.name === link.name)
  );

  return uniqueLinks;
}