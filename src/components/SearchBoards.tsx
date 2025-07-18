import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { rtdb } from "../config/firebase";
import { ref, get } from "firebase/database";
import { User, Board, Cursor, Project } from "../types";
import { useProject } from "../contexts/ProjectContext";

interface SearchBoardsProps {
  user: User;
}

export function SearchBoards({ user }: SearchBoardsProps) {
  const { currentProjectId } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Board[]>([]);
  const [boardThumbnails, setBoardThumbnails] = useState<Record<string, string>>({});
  const [boardTitles, setBoardTitles] = useState<Record<string, string>>({});
  const [boardDescriptions, setBoardDescriptions] = useState<Record<string, string>>({});
  const [project, setProject] = useState<Project | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Get boards in current project
  const searchBoards = async (query: string) => {
    if (!query.trim() || !currentProjectId) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results: Board[] = [];
      const thumbnailMap: Record<string, string> = {};
      const titleMap: Record<string, string> = {};
      const descriptionMap: Record<string, string> = {};

      // Get current project data
      const projectRef = ref(rtdb, `projects/${currentProjectId}`);
      const projectSnapshot = await get(projectRef);
      if (projectSnapshot.exists()) {
        const projectData = projectSnapshot.val();
        setProject(projectData);

        // Get boards in current project
        const projectBoardsRef = ref(rtdb, `projectBoards/${currentProjectId}`);
        const projectBoardsSnapshot = await get(projectBoardsRef);
        const projectBoardsData = projectBoardsSnapshot.val();

        if (projectBoardsData) {
          const boardIds = Object.keys(projectBoardsData);

          for (const boardId of boardIds) {
            const boardRef = ref(rtdb, `boards/${boardId}`);
            const boardSnapshot = await get(boardRef);
            if (boardSnapshot.exists()) {
              const board = {
                id: boardId,
                ...boardSnapshot.val(),
              };

              // Search in board name, title, and description
              const boardTitle = board.metadata?.title || board.name || "";
              const boardDescription = board.metadata?.description || "";
              
              const lowercaseQuery = query.toLowerCase();
              const titleMatch = boardTitle.toLowerCase().includes(lowercaseQuery);
              const descriptionMatch = boardDescription.toLowerCase().includes(lowercaseQuery);

              if (titleMatch || descriptionMatch) {
                results.push(board);

                // Store metadata
                if (board.metadata) {
                  if (board.metadata.title) {
                    titleMap[board.id] = board.metadata.title;
                  }
                  if (board.metadata.description) {
                    descriptionMap[board.id] = board.metadata.description;
                  }
                  if (board.metadata.thumbnailUrl) {
                    thumbnailMap[board.id] = board.metadata.thumbnailUrl;
                  }
                } else {
                  titleMap[board.id] = board.name || "";
                }
              }
            }
          }
        }
      }

      // Sort results by relevance (title matches first, then by updated date)
      const sortedResults = results.sort((a, b) => {
        const aTitle = titleMap[a.id] || "";
        const bTitle = titleMap[b.id] || "";
        const lowercaseQuery = query.toLowerCase();
        
        const aTitleMatch = aTitle.toLowerCase().includes(lowercaseQuery);
        const bTitleMatch = bTitle.toLowerCase().includes(lowercaseQuery);
        
        if (aTitleMatch && !bTitleMatch) return -1;
        if (!aTitleMatch && bTitleMatch) return 1;
        
        return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      });

      setSearchResults(sortedResults);
      setBoardThumbnails(thumbnailMap);
      setBoardTitles(titleMap);
      setBoardDescriptions(descriptionMap);
    } catch (error) {
      console.error("Error searching boards:", error);
    } finally {
      setIsSearching(false);
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

      {currentProjectId && isSearching && (
        <div className="search-loading">Searching...</div>
      )}

      {currentProjectId && searchQuery && !isSearching && searchResults.length === 0 && (
        <div className="no-results">
          No boards found for "{searchQuery}"
        </div>
      )}

      {currentProjectId && searchResults.length > 0 && (
        <div className="search-results">
          <div className="results-count">
            {searchResults.length} board{searchResults.length === 1 ? '' : 's'} found
          </div>
          <div className="boards-grid">
            {searchResults.map((board) => (
              <div key={board.id} className="board-card-wrapper">
                <Link
                  to={
                    project?.slug
                      ? `/${project.slug}/${encodeURIComponent(board.name)}`
                      : `/${board.id}`
                  }
                  className="board-card"
                >
                  <p className="board-name">{boardTitles[board.id] || ""}</p>
                  {boardThumbnails[board.id] ? (
                    <div className="board-thumbnail">
                      <img
                        src={boardThumbnails[board.id]}
                        alt={`${board.name} thumbnail`}
                        className="thumbnail-image"
                      />
                    </div>
                  ) : (
                    <div className="board-card-content">
                      {boardDescriptions[board.id] && (
                        <p className="board-description">
                          {boardDescriptions[board.id]}
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