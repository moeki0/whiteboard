import { describe, test, expect } from "vitest";
import { isYouTubeUrl, getYouTubeEmbedUrl } from "../utils/youtubeEmbed";

describe("YouTube埋め込み機能", () => {
  describe("isYouTubeUrl", () => {
    test("YouTubeのURLを正しく検出する", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
        true
      );
    });

    test("YouTube短縮URLを正しく検出する", () => {
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    test("YouTubeでないURLは検出しない", () => {
      expect(isYouTubeUrl("https://example.com")).toBe(false);
    });

    test("空文字は検出しない", () => {
      expect(isYouTubeUrl("")).toBe(false);
    });
  });

  describe("getYouTubeEmbedUrl", () => {
    test("YouTubeの通常URLから埋め込みURLを生成する", () => {
      expect(
        getYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    test("YouTube短縮URLから埋め込みURLを生成する", () => {
      expect(getYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
        "https://www.youtube.com/embed/dQw4w9WgXcQ"
      );
    });

    test("不正なURLの場合はnullを返す", () => {
      expect(getYouTubeEmbedUrl("https://example.com")).toBe(null);
    });
  });
});
