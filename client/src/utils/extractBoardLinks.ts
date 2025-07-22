export const extractBoardLinks = (
  text: string,
  boardLinks: Map<string, string | null>
): Array<{ name: string; boardId: string }> => {
  const boardLinksArray: Array<{ name: string; boardId: string }> = [];

  // URLパターンを検出する正規表現（文字列全体を対象に）
  const urlPattern = /https?:\/\/|ftp:\/\/|file:\/\/|mailto:/i;

  // [name]記法（リンク用）を検出 - .iconや.imgで終わらないもの
  const boardLinkMatches = text.matchAll(/\[([^\]]+)\](?!\.(?:icon|img))/g);
  for (const match of boardLinkMatches) {
    const boardName = match[1];
    
    // URLパターンの場合はスキップ
    if (urlPattern.test(boardName)) {
      continue;
    }
    
    // .icon*8などが誤って含まれていないかチェック
    if (!boardName.includes(".icon") && !boardName.includes(".img")) {
      const boardId = boardLinks.get(boardName);
      // 存在しないボードも含めて問答無用でリンクを表示
      boardLinksArray.push({ name: boardName, boardId: boardId || "" });
    }
  }

  // [name.icon*8]記法を検出 - .iconの前の部分だけを取得
  const boardIconMatches = text.matchAll(/\[([^.\]]+)\.icon(?:\*\d+)?\]/g);
  for (const match of boardIconMatches) {
    const boardName = match[1];
    const boardId = boardLinks.get(boardName);
    // 存在しないボードも含めて問答無用でリンクを表示
    boardLinksArray.push({ name: boardName, boardId: boardId || "" });
  }

  // 重複を除去
  const uniqueLinks = boardLinksArray.filter(
    (link, index, self) => index === self.findIndex((l) => l.name === link.name)
  );

  return uniqueLinks;
};
