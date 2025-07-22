const COLORS = [
  "#FF6B6B", // コーラルレッド
  "#4ECDC4", // ターコイズ
  "#45B7D1", // スカイブルー
  "#96CEB4", // ミントグリーン
  "#FFEAA7", // ライトイエロー
  "#DDA0DD", // プラム
  "#98D8C8", // アクアマリン
  "#F7DC6F", // バナナイエロー
  "#BB8FCE", // ライトパープル
  "#F8C471", // ピーチ
];

export function getUserColor(userId: string): string {
  // ユーザーIDから一意の色を決定
  const hash = userId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

export function generateUserInitials(displayName: string | null, email: string | null): string {
  if (displayName) {
    return displayName
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  }
  
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  
  return "U";
}