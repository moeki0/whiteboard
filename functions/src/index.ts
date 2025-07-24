import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import algoliasearch from "algoliasearch";
import * as cors from "cors";

admin.initializeApp();

// Algolia設定
const algoliaConfig = functions.config().algolia || {
  app_id: process.env.ALGOLIA_APP_ID || "VE0JZILTOJ",
  admin_key:
    process.env.ALGOLIA_ADMIN_KEY || "c6b2d2748ad3942c8be47a2cc90c063c",
};

const client = algoliasearch(algoliaConfig.app_id, algoliaConfig.admin_key);

const boardsIndex = client.initIndex("boards");

// CORS設定
const corsHandler = cors({
  origin: true, // すべてのオリジンを許可
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

interface AlgoliaBoard {
  objectID: string;
  boardId: string;
  name: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  searchableText: string;
}

export const syncBoard = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data: any, context: any) => {
    // 認証チェック - 開発時は認証をスキップ
    if (!context.auth && process.env.NODE_ENV !== "development") {
      console.warn("User not authenticated, skipping sync");
      return { success: false, error: "Not authenticated" };
    }

    const { board }: { board: AlgoliaBoard } = data;

    if (!board || !board.objectID) {
      return { success: false, error: "Board data is required" };
    }

    try {
      // Algoliaにボードデータを保存
      await boardsIndex.saveObject(board);

      return { success: true, objectID: board.objectID };
    } catch (error) {
      console.error("Algolia sync error:", error);
      // エラーを投げずに結果を返す
      return { success: false, error: "Failed to sync board" };
    }
  });

export const removeBoard = functions.https.onCall(async (data: any, context: any) => {
  // 認証チェック
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const { objectID } = data;

  if (!objectID) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "ObjectID is required"
    );
  }

  try {
    // Algoliaからボードデータを削除
    await boardsIndex.deleteObject(objectID);

    return { success: true, objectID };
  } catch (error) {
    console.error("Algolia remove error:", error);
    throw new functions.https.HttpsError("internal", "Failed to remove board");
  }
});

export const syncProject = functions.https.onCall(async (data: any, context: any) => {
  // 認証チェック
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const { boards }: { boards: AlgoliaBoard[] } = data;

  if (!boards || !Array.isArray(boards)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Boards array is required"
    );
  }

  try {
    // Algoliaに複数のボードデータを保存
    await boardsIndex.saveObjects(boards);

    return { success: true, count: boards.length };
  } catch (error) {
    console.error("Algolia project sync error:", error);
    throw new functions.https.HttpsError("internal", "Failed to sync project");
  }
});

// onRequest版の関数（CORS対応）
export const syncBoardHttp = functions.https.onRequest(async (req: any, res: any) => {
  return corsHandler(req, res, async () => {
    try {
      // プリフライトリクエストの処理
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Firebase Auth IDトークンの検証
      const authorization = req.headers.authorization;
      if (!authorization || !authorization.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authorization.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);

      const { board }: { board: AlgoliaBoard } = req.body;

      if (!board || !board.objectID) {
        res.status(400).json({ error: "Board data is required" });
        return;
      }

      // Algoliaにボードデータを保存
      await boardsIndex.saveObject(board);

      res.json({ data: { success: true, objectID: board.objectID } });
    } catch (error) {
      console.error("Algolia sync error:", error);
      res.status(500).json({ error: "Failed to sync board" });
    }
  });
});

export const removeBoardHttp = functions.https.onRequest(async (req: any, res: any) => {
  return corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const authorization = req.headers.authorization;
      if (!authorization || !authorization.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const idToken = authorization.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);

      const { objectID } = req.body;

      if (!objectID) {
        res.status(400).json({ error: "ObjectID is required" });
        return;
      }

      await boardsIndex.deleteObject(objectID);

      res.json({ data: { success: true, objectID } });
    } catch (error) {
      console.error("Algolia remove error:", error);
      res.status(500).json({ error: "Failed to remove board" });
    }
  });
});

// Scrapbox APIプロキシ
export const searchScrapboxTitles = functions.https.onRequest(async (req: any, res: any) => {
  return corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const { projectName, q: query } = req.query;

      if (!projectName || !query) {
        res.status(400).json({ error: "projectName and q parameters are required" });
        return;
      }

      if (typeof projectName !== "string" || typeof query !== "string") {
        res.status(400).json({ error: "projectName and q must be strings" });
        return;
      }


      // Scrapbox APIを呼び出し
      const scrapboxUrl = `https://scrapbox.io/api/pages/${encodeURIComponent(projectName)}/search/titles?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(scrapboxUrl);
      
      if (!response.ok) {
        console.warn("[Scrapbox Proxy] API error:", response.status, response.statusText);
        res.status(response.status).json({ error: "Scrapbox API error" });
        return;
      }

      const data = await response.json();

      // レスポンスをそのまま返す
      res.json(data);
    } catch (error) {
      console.error("[Scrapbox Proxy] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
});
