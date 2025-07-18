import { Link, useNavigate } from "react-router-dom";
import { ReactNode, memo } from "react";
import { UnifiedMenu } from "./UnifiedMenu";
import { User } from "../types";
import "./Header.css";

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
}

export const Header = memo(function Header({
  backButton,
  user,
  children,
  subtitle,
  titleLink,
  onSubtitleClick,
  isEditingSubtitle,
  editingSubtitle,
  onSubtitleChange,
  onSubtitleSave,
  isDuplicateName,
}: HeaderProps) {
  const navigate = useNavigate();
  const savedProjectName =
    typeof window !== "undefined"
      ? sessionStorage.getItem("currentProjectName")
      : null;
  const displayTitle = savedProjectName;

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
                    onKeyPress={(e) => e.key === "Enter" && onSubtitleSave?.()}
                    onBlur={onSubtitleSave}
                    autoFocus
                    className={`board-title-input ${isDuplicateName ? "duplicate-warning" : ""}`}
                  />
                  {isDuplicateName && (
                    <div className="duplicate-tooltip">
                      This name already exists. A suffix will be added automatically.
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
      <div className="user-info">
        <UnifiedMenu user={user} />
      </div>
    </div>
  );
});
