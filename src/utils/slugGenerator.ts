import { rtdb } from '../config/firebase';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';

/**
 * Generate a URL-friendly slug from a project name
 */
export function generateSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Validate slug format
 */
export function validateSlug(slug: string): { isValid: boolean; error?: string } {
  if (!slug) {
    return { isValid: false, error: 'Slug is required' };
  }

  if (slug.length < 3) {
    return { isValid: false, error: 'Slug must be at least 3 characters long' };
  }

  if (slug.length > 50) {
    return { isValid: false, error: 'Slug must be 50 characters or less' };
  }

  // Check for valid characters (lowercase letters, numbers, hyphens)
  const validSlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!validSlugRegex.test(slug)) {
    return { 
      isValid: false, 
      error: 'Slug can only contain lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.' 
    };
  }

  // Check for reserved words
  const reservedWords = [
    'admin', 'api', 'app', 'auth', 'board', 'create', 'dashboard', 
    'edit', 'help', 'home', 'login', 'logout', 'project', 'settings', 
    'user', 'users', 'www', 'mail', 'ftp', 'localhost', 'invite'
  ];
  
  if (reservedWords.includes(slug)) {
    return { isValid: false, error: 'This slug is reserved and cannot be used' };
  }

  return { isValid: true };
}

/**
 * Check if a slug is already taken
 */
export async function checkSlugAvailability(slug: string): Promise<{ isAvailable: boolean; error?: string }> {
  try {
    const projectsRef = ref(rtdb, 'projects');
    const projectQuery = query(projectsRef, orderByChild('slug'), equalTo(slug));
    const snapshot = await get(projectQuery);
    
    if (snapshot.exists()) {
      return { isAvailable: false, error: 'This slug is already taken' };
    }
    
    return { isAvailable: true };
  } catch (error) {
    console.error('Error checking slug availability:', error);
    return { isAvailable: false, error: 'Failed to check slug availability' };
  }
}

/**
 * Generate a unique slug with fallback numbers
 */
export async function generateUniqueSlug(baseName: string): Promise<string> {
  const baseSlug = generateSlugFromName(baseName);
  
  // Check if the base slug is available
  const baseCheck = await checkSlugAvailability(baseSlug);
  if (baseCheck.isAvailable) {
    return baseSlug;
  }
  
  // Try numbered variations
  let counter = 1;
  while (counter <= 999) {
    const numberedSlug = `${baseSlug}-${counter}`;
    const check = await checkSlugAvailability(numberedSlug);
    if (check.isAvailable) {
      return numberedSlug;
    }
    counter++;
  }
  
  // Fallback to timestamp-based slug
  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
}