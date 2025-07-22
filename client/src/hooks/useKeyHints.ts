import React, { useState } from "react";

export interface KeyHintsState {
  isKeyHintMode: boolean;
  setIsKeyHintMode: React.Dispatch<React.SetStateAction<boolean>>;
  pressedKeyHistory: Array<string>;
  setPressedKeyHistory: React.Dispatch<React.SetStateAction<Array<string>>>;
  noteHintKeys: Map<string, string>;
  setNoteHintKeys: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

export function useKeyHints(): KeyHintsState {
  const [isKeyHintMode, setIsKeyHintMode] = useState<boolean>(false);
  const [pressedKeyHistory, setPressedKeyHistory] = useState<Array<string>>([]);
  const [noteHintKeys, setNoteHintKeys] = useState<Map<string, string>>(
    new Map()
  );

  return {
    isKeyHintMode,
    setIsKeyHintMode,
    pressedKeyHistory,
    setPressedKeyHistory,
    noteHintKeys,
    setNoteHintKeys,
  };
}
