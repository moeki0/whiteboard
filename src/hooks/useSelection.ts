import { useState } from 'react';

export interface SelectionState {
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedItemIds: Set<string>;
  setSelectedItemIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedGroupIds: Set<string>;
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSelecting: boolean;
  setIsSelecting: React.Dispatch<React.SetStateAction<boolean>>;
  selectionStart: { x: number; y: number } | null;
  setSelectionStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  selectionEnd: { x: number; y: number } | null;
  setSelectionEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  justFinishedSelection: boolean;
  setJustFinishedSelection: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSelection(): SelectionState {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set()
  );
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [justFinishedSelection, setJustFinishedSelection] =
    useState<boolean>(false);

  return {
    selectedNoteIds,
    setSelectedNoteIds,
    selectedItemIds,
    setSelectedItemIds,
    selectedGroupIds,
    setSelectedGroupIds,
    isSelecting,
    setIsSelecting,
    selectionStart,
    setSelectionStart,
    selectionEnd,
    setSelectionEnd,
    isMultiSelectMode,
    setIsMultiSelectMode,
    justFinishedSelection,
    setJustFinishedSelection,
  };
}