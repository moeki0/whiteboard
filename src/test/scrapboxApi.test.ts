import { searchScrapboxTitles } from '../utils/scrapboxApi';

describe('scrapboxApi', () => {
  test('should search titles from Scrapbox API', async () => {
    const projectName = 'test-project';
    const query = 'test';
    
    const titles = await searchScrapboxTitles(projectName, query);
    
    expect(Array.isArray(titles)).toBe(true);
    expect(titles.length).toBeGreaterThanOrEqual(0);
  });
});