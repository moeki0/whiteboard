import algoliasearch from 'algoliasearch';

// Algolia configuration
const ALGOLIA_APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID || '';
const ALGOLIA_SEARCH_API_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY || '';
const ALGOLIA_ADMIN_API_KEY = import.meta.env.VITE_ALGOLIA_ADMIN_API_KEY || '';

// Index name for boards
export const BOARDS_INDEX_NAME = 'boards';

// Initialize Algolia clients
export const algoliaSearchClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY);
export const algoliaAdminClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

// Get search index
export const boardsSearchIndex = algoliaSearchClient.initIndex(BOARDS_INDEX_NAME);
export const boardsAdminIndex = algoliaAdminClient.initIndex(BOARDS_INDEX_NAME);

// Board search interface
export interface AlgoliaBoard {
  objectID: string;
  boardId: string;
  name: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  projectSlug?: string;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  searchableText: string; // Combined searchable content
}

// Search configuration
export const searchConfig = {
  attributesToRetrieve: [
    'objectID',
    'boardId', 
    'name',
    'title',
    'description',
    'projectId',
    'projectName',
    'projectSlug',
    'createdAt',
    'updatedAt',
    'thumbnailUrl'
  ],
  attributesToHighlight: ['title', 'description', 'name'],
  hitsPerPage: 20,
  typoTolerance: true
};