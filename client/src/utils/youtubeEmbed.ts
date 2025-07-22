export function isYouTubeUrl(url: string): boolean {
  if (!url.trim()) return false;
  
  try {
    const urlObj = new URL(url.trim());
    return (
      (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') ||
      (urlObj.hostname === 'youtu.be')
    );
  } catch {
    return false;
  }
}

export function getYouTubeEmbedUrl(url: string): string | null {
  if (!isYouTubeUrl(url)) return null;
  
  try {
    const urlObj = new URL(url.trim());
    
    if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1);
      return `https://www.youtube.com/embed/${videoId}`;
    }
    
    if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
      const videoId = urlObj.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}