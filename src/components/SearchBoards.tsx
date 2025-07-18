import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { User, Board, Cursor, Project } from "../types";
import { useProject } from "../contexts/ProjectContext";
import { boardsSearchIndex, boardsAdminIndex, searchConfig, AlgoliaBoard } from "../config/algolia";

interface SearchBoardsProps {
  user: User;
}

export function SearchBoards({ user }: SearchBoardsProps) {
  const { currentProjectId } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AlgoliaBoard[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Search boards using Algolia
  const searchBoards = async (query: string) => {
    if (!query.trim() || !currentProjectId) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    
    try {
      // Configure facets for filtering (one-time setup)
      try {
        await boardsAdminIndex.setSettings({
          attributesForFaceting: ['projectId', 'projectName'],
          searchableAttributes: ['title', 'description', 'name', 'searchableText'],
          attributesToHighlight: ['title', 'description', 'name']
        });
      } catch (settingsError) {
        // Ignore settings errors (likely using search-only key)
      }

      // Search with Algolia using project filter
      const result = await boardsSearchIndex.search<AlgoliaBoard>(query, {
        ...searchConfig,
        filters: `projectId:"${currentProjectId}"`
      });
      
      setSearchResults(result.hits || []);
    } catch (error) {
      console.error("Error searching boards with Algolia:", error);
      setSearchError("Search is currently unavailable. Please try again later.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Get current project information
  useEffect(() => {
    if (!currentProjectId) {
      setProject(null);
      return;
    }

    const getProjectInfo = async () => {
      try {
        const projectRef = ref(rtdb, `projects/${currentProjectId}`);
        const projectSnapshot = await get(projectRef);
        if (projectSnapshot.exists()) {
          setProject(projectSnapshot.val());
        }
      } catch (error) {
        console.error("Error getting project info:", error);
      }
    };

    getProjectInfo();
  }, [currentProjectId]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchBoards(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentProjectId]);

  return (
    <div className="board-list">
      <div className="search-header">
        <h1>Search Boards {project && `in ${project.name}`}</h1>
        {!currentProjectId && (
          <p className="no-project-warning">Please select a project to search boards</p>
        )}
        {currentProjectId && (
          <div className="search-container">
            <input
              type="text"
              placeholder="Search boards by title or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        )}
      </div>

      {searchError && (
        <div className="search-error">
          {searchError}
        </div>
      )}

      {currentProjectId && isSearching && (
        <div className="search-loading">Searching...</div>
      )}

      {currentProjectId && searchQuery && !isSearching && !searchError && searchResults.length === 0 && (
        <div className="no-results">
          No boards found for "{searchQuery}"
        </div>
      )}

      {currentProjectId && searchResults.length > 0 && !searchError && (
        <div className="search-results">
          <div className="results-count">
            {searchResults.length} board{searchResults.length === 1 ? '' : 's'} found
          </div>
          <div className="boards-grid">
            {searchResults.map((board) => (
              <div key={board.objectID} className="board-card-wrapper">
                <Link
                  to={
                    board.projectSlug
                      ? `/${board.projectSlug}/${encodeURIComponent(board.name)}`
                      : `/board/${board.boardId}`
                  }
                  className="board-card"
                >
                  <p className="board-name">{board.title || board.name}</p>
                  {board.thumbnailUrl ? (
                    <div className="board-thumbnail">
                      <img
                        src={board.thumbnailUrl}
                        alt={`${board.name} thumbnail`}
                        className="thumbnail-image"
                      />
                    </div>
                  ) : (
                    <div className="board-card-content">
                      {board.description && (
                        <p className="board-description">
                          {board.description}
                        </p>
                      )}
                    </div>
                  )}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}