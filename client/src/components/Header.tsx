import { Link, useNavigate } from "react-router-dom";
import { ReactNode, memo, useState, useEffect, useRef } from "react";
import { UnifiedMenu } from "./UnifiedMenu";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import {
  boardsSearchIndex,
  boardsAdminIndex,
  searchConfig,
  AlgoliaBoard,
} from "../config/algolia";
import "./Header.css";
import { LuSearch } from "react-icons/lu";

interface BackButton {
  path: string;
  label: string;
}

interface HeaderProps {
  backButton?: BackButton;
  user: User;
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  titleLink?: string;
  onSubtitleClick?: () => void;
  isEditingSubtitle?: boolean;
  editingSubtitle?: string;
  onSubtitleChange?: (value: string) => void;
  onSubtitleSave?: () => void;
  isDuplicateName?: boolean;
  showSearch?: boolean;
}

export const Header = memo(function Header({
  backButton,
  user,
  children,
  title,
  subtitle,
  titleLink,
  onSubtitleClick,
  isEditingSubtitle,
  editingSubtitle,
  onSubtitleChange,
  onSubtitleSave,
  isDuplicateName,
  showSearch = false,
}: HeaderProps) {
  const navigate = useNavigate();
  const { currentProjectId } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AlgoliaBoard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // Use title prop passed from HeaderWrapper instead of directly accessing sessionStorage
  const displayTitle = title;

  // Search boards using Algolia
  const searchBoards = async (query: string) => {
    if (!query.trim() || !currentProjectId) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);

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
        hitsPerPage: 5, // Limit results for dropdown
      });

      setSearchResults(result.hits || []);
      setShowDropdown(true);
    } catch (error) {
      console.error("Error searching boards with Algolia:", error);
      setSearchResults([]);
      setShowDropdown(false);
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

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && showDropdown) {
      const dropdownElement = document.querySelector('.search-dropdown');
      if (dropdownElement) {
        const allItems = dropdownElement.querySelectorAll('.search-dropdown-item:not(.searching):not(.no-results)');
        const selectedElement = allItems[selectedIndex];
        if (selectedElement) {
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }
    }
  }, [selectedIndex, showDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        mobileSearchRef.current &&
        !mobileSearchRef.current.contains(event.target as Node)
      ) {
        setShowMobileSearch(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Cmd+G (Mac) or Ctrl+G (Windows/Linux) for search
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "g" &&
        showSearch &&
        currentProjectId
      ) {
        event.preventDefault();

        // Check if we're on mobile (viewport width)
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
          // On mobile, open the search bar
          setShowMobileSearch(true);
          // Focus will be set by autoFocus on the input
        } else {
          // On desktop, focus the search input
          desktopSearchInputRef.current?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [showSearch, currentProjectId]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedIndex(-1); // Reset selection when search changes
  };

  const handleResultClick = (board: AlgoliaBoard) => {
    const path = board.projectSlug
      ? `/${board.projectSlug}/${encodeURIComponent(board.name)}`
      : `/board/${board.boardId}`;
    navigate(path);
    setShowDropdown(false);
    setSearchQuery("");
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          handleResultClick(searchResults[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
      // Emacs keybindings
      case "n":
        if (e.ctrlKey) {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case "p":
        if (e.ctrlKey) {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        }
        break;
    }
  };

  const toggleMobileSearch = () => {
    setShowMobileSearch((prev) => !prev);
    if (!showMobileSearch) {
      setSearchQuery("");
      setSelectedIndex(-1);
      setShowDropdown(false);
    }
  };

  return (
    <div className="app-header">
      <div className="header-left">
        <div className="header-titles">
          <Link to={titleLink || "/"} className="header-title">
            {displayTitle}
          </Link>
          {subtitle && (
            <>
              <span className="header-separator">/</span>
              {isEditingSubtitle ? (
                <div className="board-title-input-container">
                  <input
                    type="text"
                    value={editingSubtitle ?? subtitle}
                    onChange={(e) => onSubtitleChange?.(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        onSubtitleSave?.();
                      } else if (e.key === "Escape") {
                        onSubtitleCancel?.();
                      }
                    }}
                    onBlur={onSubtitleSave}
                    autoFocus
                    className={`board-title-input ${
                      isDuplicateName ? "duplicate-warning" : ""
                    }`}
                  />
                  {isDuplicateName && (
                    <div className="duplicate-tooltip">
                      This name already exists. A suffix will be added
                      automatically.
                    </div>
                  )}
                </div>
              ) : (
                <span
                  className="header-subtitle"
                  onClick={onSubtitleClick}
                  style={{ cursor: onSubtitleClick ? "pointer" : "default" }}
                  title={onSubtitleClick ? "Click to edit" : undefined}
                >
                  {subtitle}
                </span>
              )}
            </>
          )}
        </div>
        {backButton && (
          <button
            className="back-btn"
            onClick={() => navigate(backButton.path)}
          >
            {backButton.label}
          </button>
        )}
        {children}
      </div>

      <div className="header-right">
        {/* Desktop Search Section */}
        {showSearch && currentProjectId && (
          <div className="header-center desktop-search" ref={searchRef}>
            <div className="search-container">
              <input
                ref={desktopSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="header-search-input"
              />
              {showDropdown && (
                <div className="search-dropdown" data-testid="search-dropdown">
                  {isSearching && (
                    <div className="search-dropdown-item searching">
                      Searching...
                    </div>
                  )}
                  {!isSearching &&
                    searchResults.length === 0 &&
                    searchQuery && (
                      <div className="search-dropdown-item no-results">
                        No boards found for "{searchQuery}"
                      </div>
                    )}
                  {!isSearching &&
                    searchResults.map((board, index) => (
                      <div
                        key={board.objectID}
                        className={`search-dropdown-item ${
                          index === selectedIndex ? "selected" : ""
                        }`}
                        onClick={() => handleResultClick(board)}
                      >
                        <div className="search-result-title">
                          {board.title || board.name}
                        </div>
                        {board.description && (
                          <div className="search-result-description">
                            {board.description}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile Search Icon */}
        {showSearch && currentProjectId && (
          <button
            className="mobile-search-icon"
            onClick={toggleMobileSearch}
            data-testid="mobile-search-icon"
            aria-label="Toggle search"
          >
            <LuSearch size={20} />
          </button>
        )}

        <div className="user-info">
          <UnifiedMenu user={user} />
        </div>
      </div>

      {/* Mobile Search Bar */}
      {showMobileSearch && showSearch && currentProjectId && (
        <div
          className="mobile-search-bar"
          ref={mobileSearchRef}
          data-testid="mobile-search-bar"
        >
          <div className="mobile-search-container">
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="mobile-search-input"
              autoFocus
            />
            <button
              className="mobile-search-close"
              onClick={toggleMobileSearch}
              aria-label="Close search"
            >
              ×
            </button>
          </div>
          {showDropdown && (
            <div className="mobile-search-dropdown">
              {isSearching && (
                <div className="search-dropdown-item searching">
                  Searching...
                </div>
              )}
              {!isSearching && searchResults.length === 0 && searchQuery && (
                <div className="search-dropdown-item no-results">
                  No boards found for "{searchQuery}"
                </div>
              )}
              {!isSearching &&
                searchResults.map((board, index) => (
                  <div
                    key={board.objectID}
                    className={`search-dropdown-item ${
                      index === selectedIndex ? "selected" : ""
                    }`}
                    onClick={() => handleResultClick(board)}
                  >
                    <div className="search-result-title">
                      {board.title || board.name}
                    </div>
                    {board.description && (
                      <div className="search-result-description">
                        {board.description}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
