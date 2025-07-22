import React, { useState } from "react";

export interface PanZoomState {
  panX: number;
  setPanX: React.Dispatch<React.SetStateAction<number>>;
  panY: number;
  setPanY: React.Dispatch<React.SetStateAction<number>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  panStartPos: { x: number; y: number } | null;
  setPanStartPos: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  initialPan: { x: number; y: number } | null;
  setInitialPan: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  lastWheelTime: number;
  setLastWheelTime: React.Dispatch<React.SetStateAction<number>>;
}

export function usePanZoom(): PanZoomState {
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartPos, setPanStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialPan, setInitialPan] = useState<{ x: number; y: number } | null>(
    null
  );
  const [lastWheelTime, setLastWheelTime] = useState<number>(0);

  return {
    panX,
    setPanX,
    panY,
    setPanY,
    zoom,
    setZoom,
    isPanning,
    setIsPanning,
    panStartPos,
    setPanStartPos,
    initialPan,
    setInitialPan,
    lastWheelTime,
    setLastWheelTime,
  };
}
