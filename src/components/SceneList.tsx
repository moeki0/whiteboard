import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BoardScene, User, Board, Project } from "../types";
import {
  getBoardScenes,
  createBoardScene,
  deleteBoardScene,
  updateSceneName,
} from "../utils/boardScenes";
import { useBoard } from "../hooks/useBoard";
import { checkBoardEditPermission } from "../utils/permissions";
import "./SceneList.css";

interface SceneListProps {
  user: User | null;
}

export function SceneList({ user }: SceneListProps) {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<BoardScene[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Board情報を取得
  const { board, project, boardName } = useBoard(user, navigate, "scene-list");

  // シーン一覧を取得
  useEffect(() => {
    if (!boardId || !user) return;

    const unsubscribe = getBoardScenes(boardId, (scenes) => {
      setScenes(scenes);
    });

    return unsubscribe;
  }, [boardId, user]);

  // 編集権限をチェック
  const canEdit = board
    ? checkBoardEditPermission(board, project, user?.uid || null).canEdit
    : false;

  // フィルタリングされたシーン
  const filteredScenes = scenes.filter((scene) =>
    scene.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBackToBoard = () => {
    navigate(`/${boardId}`);
  };

  const handleSceneSelect = (sceneId: string) => {
    navigate(`/${boardId}?scene=${sceneId}`);
  };

  const handleCreateScene = async () => {
    if (!boardId || !user?.uid || !newSceneName.trim()) return;

    const newSceneId = await createBoardScene(
      boardId,
      newSceneName.trim(),
      user.uid
    );

    if (newSceneId) {
      setNewSceneName("");
      setIsCreating(false);
      // 新しいシーンに移動
      navigate(`/${boardId}?scene=${newSceneId}`);
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!boardId || !confirm("Are you sure you want to delete this scene?"))
      return;

    await deleteBoardScene(boardId, sceneId);
  };

  const handleStartRename = (scene: BoardScene) => {
    setEditingSceneId(scene.id);
    setEditingName(scene.name);
  };

  const handleFinishRename = async () => {
    if (!boardId || !editingSceneId || !editingName.trim()) {
      setEditingSceneId(null);
      setEditingName("");
      return;
    }

    await updateSceneName(boardId, editingSceneId, editingName.trim());
    setEditingSceneId(null);
    setEditingName("");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="scene-list-container">
      <div className="scene-list-content">
        <div className="scene-grid">
          {isCreating && (
            <div className="scene-card create-card">
              <div className="scene-card-content">
                <input
                  type="text"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  placeholder="Scene name"
                  className="scene-name-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateScene();
                    } else if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewSceneName("");
                    }
                  }}
                />
                <div className="create-actions">
                  <button
                    className="save-btn"
                    onClick={handleCreateScene}
                    disabled={!newSceneName.trim()}
                  >
                    Create
                  </button>
                  <button
                    className="cancel-btn"
                    onClick={() => {
                      setIsCreating(false);
                      setNewSceneName("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {filteredScenes.map((scene) => (
            <div key={scene.id} className="scene-card">
              <div className="scene-card-content">
                {/* 削除ボタン（右上） */}
                {canEdit && !scene.isMain && (
                  <button
                    className="delete-btn-corner"
                    onClick={() => handleDeleteScene(scene.id)}
                    title="Delete scene"
                  >
                    Delete
                  </button>
                )}

                <div className="scene-header">
                  {editingSceneId === scene.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="scene-name-input"
                      autoFocus
                      onBlur={handleFinishRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleFinishRename();
                        } else if (e.key === "Escape") {
                          setEditingSceneId(null);
                          setEditingName("");
                        }
                      }}
                    />
                  ) : (
                    <h3
                      className="scene-name clickable"
                      onClick={() => {
                        if (canEdit && !scene.isMain) {
                          handleStartRename(scene);
                        }
                      }}
                      title={canEdit && !scene.isMain ? "Click to edit" : ""}
                    >
                      {scene.name}
                    </h3>
                  )}
                </div>

                <div className="scene-info">
                  <p className="scene-meta">
                    Created: {formatDate(scene.createdAt)}
                  </p>
                  <p className="scene-meta">
                    Last modified: {formatDate(scene.lastModified)}
                  </p>
                  {scene.isMain && (
                    <span className="main-badge">Main Scene</span>
                  )}
                </div>

                <div>
                  <button
                    className="open-scene-btn"
                    onClick={() => handleSceneSelect(scene.id)}
                  >
                    Open Scene
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredScenes.length === 0 && !isCreating && (
          <div className="empty-state">
            <p>No scenes found.</p>
            {canEdit && (
              <button
                className="create-first-scene-btn"
                onClick={() => setIsCreating(true)}
              >
                Create your first scene
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
