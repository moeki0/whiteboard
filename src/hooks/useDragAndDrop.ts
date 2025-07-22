import React, { useState } from "react";

export interface DragAndDropState {
  isDraggingMultiple: boolean;
  setIsDraggingMultiple: React.Dispatch<React.SetStateAction<boolean>>;
  dragStartPos: { x: number; y: number } | null;
  setDragStartPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  initialSelectedPositions: Record<string, { x: number; y: number }>;
  setInitialSelectedPositions: React.Dispatch<
    React.SetStateAction<Record<string, { x: number; y: number }>>
  >;
  justFinishedBulkDrag: boolean;
  setJustFinishedBulkDrag: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingGroup: boolean;
  setIsDraggingGroup: React.Dispatch<React.SetStateAction<boolean>>;
  draggingGroupId: string | null;
  setDraggingGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  groupDragStartPos: { x: number; y: number } | null;
  setGroupDragStartPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  initialGroupNotePositions: Record<string, { x: number; y: number }>;
  setInitialGroupNotePositions: React.Dispatch<
    React.SetStateAction<Record<string, { x: number; y: number }>>
  >;
}

export function useDragAndDrop(): DragAndDropState {
  const [isDraggingMultiple, setIsDraggingMultiple] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialSelectedPositions, setInitialSelectedPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [justFinishedBulkDrag, setJustFinishedBulkDrag] =
    useState<boolean>(false);

  const [isDraggingGroup, setIsDraggingGroup] = useState<boolean>(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [groupDragStartPos, setGroupDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialGroupNotePositions, setInitialGroupNotePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  return {
    isDraggingMultiple,
    setIsDraggingMultiple,
    dragStartPos,
    setDragStartPos,
    initialSelectedPositions,
    setInitialSelectedPositions,
    justFinishedBulkDrag,
    setJustFinishedBulkDrag,
    isDraggingGroup,
    setIsDraggingGroup,
    draggingGroupId,
    setDraggingGroupId,
    groupDragStartPos,
    setGroupDragStartPos,
    initialGroupNotePositions,
    setInitialGroupNotePositions,
  };
}
