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
}

export const Header = memo(function Header({
  backButton,
  user,
  children,
  title,
  subtitle,
}: HeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="app-header">
      <div className="header-left">
        {title && (
          <div className="header-titles">
            <Link to={"/"} className="header-title">
              {title}
            </Link>
            {subtitle && (
              <>
                <span className="header-separator">/</span>
                <span className="header-subtitle">{subtitle}</span>
              </>
            )}
          </div>
        )}
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
