import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { UserProfile } from "../types";

// LocalStorage cache for user profiles
const PROFILE_CACHE_KEY = 'maplap_user_profiles';
const PROFILE_CACHE_TTL_KEY = 'maplap_user_profiles_ttl';
const PROFILE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// In-memory cache
const profileCache = new Map<string, UserProfile>();
const profileCacheTimestamps = new Map<string, number>();

// Load cache from LocalStorage on startup
function loadProfileCacheFromStorage() {
  try {
    const cachedData = localStorage.getItem(PROFILE_CACHE_KEY);
    const timestamps = localStorage.getItem(PROFILE_CACHE_TTL_KEY);
    
    if (cachedData && timestamps) {
      const parsedCache = JSON.parse(cachedData);
      const parsedTimestamps = JSON.parse(timestamps);
      const now = Date.now();
      
      // Only restore valid (non-expired) entries
      for (const [uid, profile] of Object.entries(parsedCache)) {
        const timestamp = parsedTimestamps[uid];
        if (timestamp && now - timestamp < PROFILE_CACHE_TTL) {
          profileCache.set(uid, profile as UserProfile);
          profileCacheTimestamps.set(uid, timestamp);
        }
      }
      
      console.log(`👤 Restored ${profileCache.size} user profile cache entries`);
    }
  } catch (error) {
    console.warn('Failed to load profile cache from localStorage:', error);
  }
}

// Save cache to LocalStorage
function saveProfileCacheToStorage() {
  try {
    const cacheObj = Object.fromEntries(profileCache);
    const timestampObj = Object.fromEntries(profileCacheTimestamps);
    
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cacheObj));
    localStorage.setItem(PROFILE_CACHE_TTL_KEY, JSON.stringify(timestampObj));
  } catch (error) {
    console.warn('Failed to save profile cache to localStorage:', error);
  }
}

// Initialize cache on module load
loadProfileCacheFromStorage();

// ユーザープロフィールを取得
export const getUserProfile = async (
  uid: string
): Promise<UserProfile | null> => {
  try {
    // Check cache first
    const cached = profileCache.get(uid);
    const cacheTime = profileCacheTimestamps.get(uid);
    const now = Date.now();
    
    if (cached && cacheTime && now - cacheTime < PROFILE_CACHE_TTL) {
      console.log(`👤 Profile cache hit for ${uid}`);
      return cached;
    }
    
    // Cache miss - fetch from Firestore
    const startTime = performance.now();
    const userDoc = await getDoc(doc(db, "userProfiles", uid));
    console.log(`👤 Profile fetch took: ${(performance.now() - startTime).toFixed(2)}ms`);
    
    if (userDoc.exists()) {
      const profile = userDoc.data() as UserProfile;
      
      // Cache the result
      const saveTime = Date.now();
      profileCache.set(uid, profile);
      profileCacheTimestamps.set(uid, saveTime);
      saveProfileCacheToStorage();
      
      console.log(`👤 Cached profile for ${uid}`);
      return profile;
    }
    
    // Cache null result (prevents repeated failed lookups)
    profileCache.set(uid, null as any);
    profileCacheTimestamps.set(uid, now);
    saveProfileCacheToStorage();
    
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
};

// ユーザー名の重複チェック
export const checkUsernameAvailability = async (
  username: string,
  excludeUid?: string
): Promise<boolean> => {
  try {
    const q = query(
      collection(db, "userProfiles"),
      where("username", "==", username.toLowerCase())
    );
    const querySnapshot = await getDocs(q);

    // 自分自身のUIDは除外
    if (excludeUid) {
      const filteredDocs = querySnapshot.docs.filter(
        (doc) => doc.id !== excludeUid
      );
      const result = filteredDocs.length === 0;
      return result;
    }

    const isAvailable = querySnapshot.empty;
    return isAvailable;
  } catch (error) {
    console.error("Error checking username availability:", error);
    return false;
  }
};

// ユーザープロフィールを作成/更新
export const updateUserProfile = async (
  profile: UserProfile
): Promise<boolean> => {
  try {
    await setDoc(doc(db, "userProfiles", profile.uid), profile);
    
    // Update cache with new profile
    const saveTime = Date.now();
    profileCache.set(profile.uid, profile);
    profileCacheTimestamps.set(profile.uid, saveTime);
    saveProfileCacheToStorage();
    
    console.log(`👤 Updated and cached profile for ${profile.uid}`);
    return true;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
};

// ユーザー名からプロフィールを検索
export const getUserProfileByUsername = async (
  username: string
): Promise<UserProfile | null> => {
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
export const validateUsername = (
  username: string
): { isValid: boolean; error?: string } => {
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
    return {
      isValid: false,
      error:
        "Username can only contain letters, numbers, underscore, and hyphen",
    };
  }

  // 最初と最後の文字は英数字のみ（1文字の場合は最初の文字のみチェック）
  const firstLastPattern = /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
  if (!firstLastPattern.test(trimmed)) {
    return {
      isValid: false,
      error: "Username must start and end with a letter or number",
    };
  }

  return { isValid: true };
};

// Cache management functions for development
function clearProfileCache() {
  profileCache.clear();
  profileCacheTimestamps.clear();
  localStorage.removeItem(PROFILE_CACHE_KEY);
  localStorage.removeItem(PROFILE_CACHE_TTL_KEY);
  console.log('👤 Profile cache cleared');
}

function checkProfileCacheStatus() {
  console.log('👤 Profile cache status:');
  console.log('Cache entries:', profileCache.size);
  console.log('Cache contents:', Object.fromEntries(profileCache));
  console.log('Timestamps:', Object.fromEntries(profileCacheTimestamps));
  console.log('TTL:', PROFILE_CACHE_TTL, 'ms');
}

// Export cache management tools in development
if (import.meta.env.DEV) {
  (window as any).profileCache = {
    check: checkProfileCacheStatus,
    clear: clearProfileCache,
    ttl: PROFILE_CACHE_TTL
  };

  console.log('👤 Profile cache tools loaded! Commands:');
  console.log('  profileCache.check() - Check cache status');
  console.log('  profileCache.clear() - Clear cache');
}
