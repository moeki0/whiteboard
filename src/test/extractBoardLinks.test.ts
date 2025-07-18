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

});