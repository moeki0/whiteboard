import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { UserProfile } from "../types";

// ユーザープロフィールを取得
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDoc = await getDoc(doc(db, "userProfiles", uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
};

// ユーザー名の重複チェック
export const checkUsernameAvailability = async (username: string, excludeUid?: string): Promise<boolean> => {
  try {
    console.log("=== Username availability check ===");
    console.log("Username:", username);
    console.log("Exclude UID:", excludeUid);
    console.log("Lowercase username:", username.toLowerCase());
    
    
    const q = query(
      collection(db, "userProfiles"),
      where("username", "==", username.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    console.log("Query result:", querySnapshot.docs.length, "documents found");
    console.log("Query empty:", querySnapshot.empty);
    
    if (!querySnapshot.empty) {
      querySnapshot.docs.forEach(doc => {
        console.log("Found document ID:", doc.id);
        console.log("Found document data:", doc.data());
      });
    }
    
    // 自分自身のUIDは除外
    if (excludeUid) {
      const filteredDocs = querySnapshot.docs.filter(doc => doc.id !== excludeUid);
      console.log("Filtered docs (excluding self):", filteredDocs.length);
      const result = filteredDocs.length === 0;
      console.log("Final result (with exclude):", result);
      return result;
    }
    
    const isAvailable = querySnapshot.empty;
    console.log("Final result (without exclude):", isAvailable);
    console.log("=== End check ===");
    return isAvailable;
  } catch (error) {
    console.error("Error checking username availability:", error);
    return false;
  }
};

// ユーザープロフィールを作成/更新
export const updateUserProfile = async (profile: UserProfile): Promise<boolean> => {
  try {
    await setDoc(doc(db, "userProfiles", profile.uid), profile);
    return true;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
};

// ユーザー名からプロフィールを検索
export const getUserProfileByUsername = async (username: string): Promise<UserProfile | null> => {
  try {
    const q = query(
      collection(db, "userProfiles"),
      where("username", "==", username.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return doc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile by username:", error);
    return null;
  }
};

// ユーザー名の形式チェック
export const validateUsername = (username: string): { isValid: boolean; error?: string } => {
  const trimmed = username.trim();
  
  if (!trimmed) {
    return { isValid: false, error: "Username cannot be empty" };
  }
  
  if (trimmed.length > 20) {
    return { isValid: false, error: "Username must be 20 characters or less" };
  }
  
  // 英数字、アンダースコア、ハイフンのみ許可
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(trimmed)) {
    return { isValid: false, error: "Username can only contain letters, numbers, underscore, and hyphen" };
  }
  
  // 最初と最後の文字は英数字のみ（1文字の場合は最初の文字のみチェック）
  const firstLastPattern = /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
  if (!firstLastPattern.test(trimmed)) {
    return { isValid: false, error: "Username must start and end with a letter or number" };
  }
  
  return { isValid: true };
};