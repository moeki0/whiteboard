import React from "react";

interface LoadingSpinnerProps {
  message?: string;
  size?: "small" | "medium" | "large";
}

export function LoadingSpinner({ 
  message = "Loading...", 
  size = "medium" 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "loading-small",
    medium: "loading-medium", 
    large: "loading-large"
  };

  return (
    <div className={`loading-spinner ${sizeClasses[size]}`}>
      <div className="spinner"></div>
      <p>{message}</p>
    </div>
  );
}