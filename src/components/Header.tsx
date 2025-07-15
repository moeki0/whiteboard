import { Link, useNavigate } from "react-router-dom";
import { ReactNode, memo, useEffect } from "react";
import { UnifiedMenu } from "./UnifiedMenu";
import { User } from "../types";
import { useProject } from "../contexts/ProjectContext";
import "./Header.css";
import { get, ref } from "firebase/database";
import { rtdb } from "../config/firebase";

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
}: HeaderProps) {
  const navigate = useNavigate();
  const { currentProjectName } = useProject();

  // sessionStorageから直接読み取って即座に表示、フォールバックでContextを使用
  const savedProjectName = sessionStorage.getItem("currentProjectName");
  const displayTitle = savedProjectName || currentProjectName || title || "Maplap";

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
                <input
                  type="text"
                  value={editingSubtitle ?? subtitle}
                  onChange={(e) => onSubtitleChange?.(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && onSubtitleSave?.()}
                  onBlur={onSubtitleSave}
                  autoFocus
                  className="board-title-input"
                />
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
      <div className="user-info">
        <UnifiedMenu user={user} />
      </div>
    </div>
  );
});
