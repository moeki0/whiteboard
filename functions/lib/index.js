"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProject = exports.removeBoard = exports.syncBoard = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const algoliasearch_1 = require("algoliasearch");
admin.initializeApp();
// Algolia設定
const algoliaConfig = functions.config().algolia || {
    app_id: process.env.ALGOLIA_APP_ID || 'VE0JZILTOJ',
    admin_key: process.env.ALGOLIA_ADMIN_KEY || 'c6b2d2748ad3942c8be47a2cc90c063c'
};
const client = (0, algoliasearch_1.default)(algoliaConfig.app_id, algoliaConfig.admin_key);
const boardsIndex = client.initIndex('boards');
exports.syncBoard = functions.https.onCall(async (data, context) => {
    // 認証チェック
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { board } = data;
    if (!board || !board.objectID) {
        throw new functions.https.HttpsError('invalid-argument', 'Board data is required');
    }
    try {
        // Algoliaにボードデータを保存
        await boardsIndex.saveObject(board);
        return { success: true, objectID: board.objectID };
    }
    catch (error) {
        console.error('Algolia sync error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to sync board');
    }
});
exports.removeBoard = functions.https.onCall(async (data, context) => {
    // 認証チェック
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { objectID } = data;
    if (!objectID) {
        throw new functions.https.HttpsError('invalid-argument', 'ObjectID is required');
    }
    try {
        // Algoliaからボードデータを削除
        await boardsIndex.deleteObject(objectID);
        return { success: true, objectID };
    }
    catch (error) {
        console.error('Algolia remove error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to remove board');
    }
});
exports.syncProject = functions.https.onCall(async (data, context) => {
    // 認証チェック
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { boards } = data;
    if (!boards || !Array.isArray(boards)) {
        throw new functions.https.HttpsError('invalid-argument', 'Boards array is required');
    }
    try {
        // Algoliaに複数のボードデータを保存
        await boardsIndex.saveObjects(boards);
        return { success: true, count: boards.length };
    }
    catch (error) {
        console.error('Algolia project sync error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to sync project');
    }
});
//# sourceMappingURL=index.js.map