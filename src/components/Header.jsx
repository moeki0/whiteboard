import { Link, useNavigate } from "react-router-dom";
import { UnifiedMenu } from "./UnifiedMenu";
import "./Header.css";

export function Header({ backButton, user, children, currentProjectId }) {
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
