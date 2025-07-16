import React, { useState } from "react";
import { BoardScene } from "../types";
import "./SceneBar.css";

interface SceneBarProps {
  scenes: BoardScene[];
  currentSceneId: string;
  onSceneSelect: (sceneId: string) => void;
  onCreateScene: (name: string) => void;
  onRenameScene: (sceneId: string, newName: string) => void;
  onViewAllScenes: () => void;
  canEdit: boolean;
}

export function SceneBar({
  scenes,
  currentSceneId,
  onSceneSelect,
  onCreateScene,
  onRenameScene,
  onViewAllScenes,
  canEdit,
}: SceneBarProps) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // 最新5件のシーンを取得（現在のシーンは必ず含む）
  const getDisplayScenes = () => {
    const sortedScenes = [...scenes].sort((a, b) => b.createdAt - a.createdAt);
    const currentScene = scenes.find(scene => scene.id === currentSceneId);
    
    // 現在のシーンが最新5件に含まれていない場合は、最新4件+現在のシーンを表示
    const latestScenes = sortedScenes.slice(0, 5);
    if (currentScene && !latestScenes.find(scene => scene.id === currentSceneId)) {
      return [...latestScenes.slice(0, 4), currentScene];
    }
    
    return latestScenes;
  };

  const displayScenes = getDisplayScenes();

  const handleCreateScene = () => {
    if (newSceneName.trim()) {
      onCreateScene(newSceneName.trim());
      setNewSceneName("");
      setShowCreateInput(false);
    }
  };

  const handleStartRename = (scene: BoardScene) => {
    setEditingSceneId(scene.id);
    setEditingName(scene.name);
  };

  const handleFinishRename = () => {
    if (editingSceneId && editingName.trim()) {
      onRenameScene(editingSceneId, editingName.trim());
    }
    setEditingSceneId(null);
    setEditingName("");
  };

  return (
    <div className="scene-bar">
      <div className="scene-tabs">
        {displayScenes.map((scene) => (
          <div
            key={scene.id}
            className={`scene-tab ${
              scene.id === currentSceneId ? "active" : ""
            }`}
          >
            {editingSceneId === scene.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) {
                    handleFinishRename();
                  } else if (e.key === "Escape") {
                    setEditingSceneId(null);
                    setEditingName("");
                  }
                }}
                className="scene-name-input"
                autoFocus
              />
            ) : (
              <div
                className="scene-tab-content"
                onClick={() => onSceneSelect(scene.id)}
                onDoubleClick={(e) => {
                  if (canEdit && !scene.isMain) {
                    e.stopPropagation();
                    handleStartRename(scene);
                  }
                }}
              >
                <span className="scene-name">{scene.name}</span>
              </div>
            )}
          </div>
        ))}

        {/* View All Scenes ボタン（常に表示） */}
        <div className="scene-view-all">
          <button
            className="scene-view-all-btn"
            onClick={onViewAllScenes}
            title="View all scenes"
          >
            View All ({scenes.length})
          </button>
        </div>

        {canEdit && (
          <div className="scene-create">
            {showCreateInput ? (
              <div className="scene-create-input">
                <input
                  type="text"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  onBlur={() => {
                    if (!newSceneName.trim()) {
                      setShowCreateInput(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) {
                      handleCreateScene();
                    } else if (e.key === "Escape") {
                      setNewSceneName("");
                      setShowCreateInput(false);
                    }
                  }}
                  placeholder="Scene name"
                  className="scene-name-input"
                  autoFocus
                />
                <button
                  className="scene-create-btn confirm"
                  onClick={handleCreateScene}
                  disabled={!newSceneName.trim()}
                >
                  ✓
                </button>
              </div>
            ) : (
              <button
                className="scene-create-btn"
                onClick={() => setShowCreateInput(true)}
                title="Create new scene"
              >
                + New Scene
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}