import { Link, useNavigate } from "react-router-dom";
import { ReactNode } from "react";
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
  currentProjectId?: string;
}

export function Header({ backButton, user, children, currentProjectId }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="app-header">
      <div className="header-left">
        <Link to={"/"}>MapLap</Link>
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
        <UnifiedMenu user={user} currentProjectId={currentProjectId} />
      </div>
    </div>
  );
}
