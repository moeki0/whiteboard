import React, { useState, useRef } from "react";

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
  // タッチ関連の状態
  isZooming: boolean;
  setIsZooming: React.Dispatch<React.SetStateAction<boolean>>;
  lastTouchDistance: number | null;
  setLastTouchDistance: React.Dispatch<React.SetStateAction<number | null>>;
  touchCenter: { x: number; y: number } | null;
  setTouchCenter: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
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
  
  // タッチ関連の状態
  const [isZooming, setIsZooming] = useState<boolean>(false);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [touchCenter, setTouchCenter] = useState<{ x: number; y: number } | null>(null);
  

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
    isZooming,
    setIsZooming,
    lastTouchDistance,
    setLastTouchDistance,
    touchCenter,
    setTouchCenter,
  };
}
