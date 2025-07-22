import { describe, it, expect } from "vitest";
import { extractBoardLinks } from "../utils/extractBoardLinks";

describe("extractBoardLinks", () => {
  const mockBoardLinks = new Map<string, string | null>([
    ["moeki", "board-id-1"],
    ["test", "board-id-2"],
    ["sample", null],
  ]);

  it("[moeki.icon*8]記法からmoekiだけを抽出する", () => {
    const content = "[moeki.icon*8]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
    expect(links[0].boardId).toBe("board-id-1");
  });

  it("[moeki.icon]記法からmoekiを抽出する", () => {
    const content = "[moeki.icon]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
    expect(links[0].boardId).toBe("board-id-1");
  });

  it("複数のアイコン記法から正しくボード名を抽出する", () => {
    const content = "[moeki.icon*3] some text [test.icon*5] [sample.icon]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    expect(links).toHaveLength(3);
    expect(links.map(l => l.name)).toContain("moeki");
    expect(links.map(l => l.name)).toContain("test");
    expect(links.map(l => l.name)).toContain("sample");
  });

  it("[moeki]という通常のリンク記法も正しく抽出する", () => {
    const content = "[moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
    expect(links[0].boardId).toBe("board-id-1");
  });

  it("アイコン記法とリンク記法が混在している場合、重複を除いて抽出する", () => {
    const content = "[moeki.icon*8] [moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // 重複除去されているはず
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
    expect(links[0].boardId).toBe("board-id-1");
  });

  it("[moeki.icon*8]の*8部分はボード名に含まれない", () => {
    const content = "[moeki.icon*8]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // ボード名が"moeki.icon*8"ではなく"moeki"であることを確認
    expect(links[0].name).toBe("moeki");
    expect(links[0].name).not.toBe("moeki.icon*8");
    expect(links[0].name).not.toContain("*");
    expect(links[0].name).not.toContain(".icon");
  });

  it("URLパターンを含む[]はボードリンクとして判定しない", () => {
    const content = "[https://example.com] [http://test.org] [ftp://files.com]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // URLパターンはボードリンクとして抽出されない
    expect(links).toHaveLength(0);
  });

  it("URLとボード名が混在している場合、ボード名のみ抽出する", () => {
    const content = "[moeki] [https://example.com] [test]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // URLは除外され、ボード名のみ抽出される
    expect(links).toHaveLength(2);
    expect(links.map(l => l.name)).toContain("moeki");
    expect(links.map(l => l.name)).toContain("test");
    expect(links.map(l => l.name)).not.toContain("https://example.com");
  });

  it("メール形式のURLも除外する", () => {
    const content = "[mailto:test@example.com] [moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // メールURLは除外され、ボード名のみ抽出される
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
  });

  it("文字列の途中にURLが含まれる場合も除外する", () => {
    const content = "[title https://example.com] [moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // URLが含まれる文字列は除外され、ボード名のみ抽出される
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
    expect(links.map(l => l.name)).not.toContain("title https://example.com");
  });

  it("様々なURLパターンが含まれる文字列を除外する", () => {
    const content = "[参照 http://example.org/path] [詳細は https://docs.example.com を見て] [moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // URLが含まれる文字列は全て除外され、ボード名のみ抽出される
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("moeki");
  });

  it("URLと類似した文字列は正常にボードリンクとして認識する", () => {
    const content = "[http-client] [https-proxy] [ftp-server] [moeki]";
    const links = extractBoardLinks(content, mockBoardLinks);
    
    // URL形式ではない類似文字列は通常のボードリンクとして認識される
    expect(links).toHaveLength(4);
    expect(links.map(l => l.name)).toContain("http-client");
    expect(links.map(l => l.name)).toContain("https-proxy");
    expect(links.map(l => l.name)).toContain("ftp-server");
    expect(links.map(l => l.name)).toContain("moeki");
  });

});