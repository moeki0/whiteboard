import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import {
  boardsSearchIndex,
  boardsAdminIndex,
  searchConfig,
  AlgoliaBoard,
} from "../config/algolia";

interface SearchBoardsProps {
  user: User;
}

export function SearchBoards({ user }: SearchBoardsProps) {
  const { currentProjectId } = useProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AlgoliaBoard[]>([]);
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
      // Configure facets for filtering (one-time setup) - only in development
      if (boardsAdminIndex) {
        try {
          await boardsAdminIndex.setSettings({
            attributesForFaceting: ["projectId", "projectName"],
            searchableAttributes: [
              "title",
              "description",
              "name",
              "searchableText",
            ],
            attributesToHighlight: ["title", "description", "name"],
          });
        } catch {
          // Ignore settings errors (likely using search-only key or in production)
        }
      }

      // Search with Algolia using project filter
      const result = await boardsSearchIndex.search<AlgoliaBoard>(query, {
        ...searchConfig,
        filters: `projectId:"${currentProjectId}"`,
      });

      setSearchResults(result.hits || []);
    } catch (error) {
      console.error("Error searching boards with Algolia:", error);
      setSearchError(
        "Search is currently unavailable. Please try again later."
      );
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };


  // Initialize search query from URL params on component mount
  useEffect(() => {
    const queryParam = searchParams.get('q');
    if (queryParam) {
      setSearchQuery(queryParam);
    }
  }, [searchParams]);

  // Update URL when search query changes
  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    
    if (query.trim()) {
      setSearchParams({ q: query });
    } else {
      setSearchParams({});
    }
  };

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
        {!currentProjectId && (
          <p className="no-project-warning">
            Please select a project to search boards
          </p>
        )}
        {currentProjectId && (
          <div className="search-container">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => updateSearchQuery(e.target.value)}
              className="search-input"
              placeholder="Search boards..."
            />
          </div>
        )}
      </div>

      {searchError && <div className="search-error">{searchError}</div>}

      {currentProjectId && isSearching && (
        <div className="search-loading">Searching...</div>
      )}

      {currentProjectId &&
        searchQuery &&
        !isSearching &&
        !searchError &&
        searchResults.length === 0 && (
          <div className="no-results">No boards found for "{searchQuery}"</div>
        )}

      {currentProjectId && searchResults.length > 0 && !searchError && (
        <div className="search-results">
          <div className="results-count">
            {searchResults.length} board{searchResults.length === 1 ? "" : "s"}{" "}
            found
          </div>
          <div className="boards-grid">
            {searchResults.map((board) => (
              <div key={board.objectID} className="board-card-wrapper">
                <Link
                  to={
                    board.projectSlug
                      ? `/${board.projectSlug}/${encodeURIComponent(
                          board.name
                        )}`
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
                        <p className="board-description">{board.description}</p>
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
