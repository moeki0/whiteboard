import { useCallback, useRef } from "react";

interface InertialZoomConfig {
  // パフォーマンス設定
  enableInertia: boolean;
  inertiaFactor: number;
  minZoomStep: number;
  frameSkip: number; // 重い環境での間引き処理
}

interface UseInertialZoomProps {
  zoom: number;
  setZoom: (value: number) => void;
  panX: number;
  setPanX: (value: number) => void;
  panY: number;
  setPanY: (value: number) => void;
  config: InertialZoomConfig;
}

export function useInertialZoom({
  zoom,
  setZoom,
  panX,
  setPanX,
  panY,
  setPanY,
  config,
}: UseInertialZoomProps) {
  const inertiaRef = useRef({
    velocity: 0,
    targetZoom: zoom,
    lastTime: 0,
    animationId: null as number | null,
    frameCount: 0,
  });

  const stopInertia = useCallback(() => {
    if (inertiaRef.current.animationId) {
      cancelAnimationFrame(inertiaRef.current.animationId);
      inertiaRef.current.animationId = null;
    }
    inertiaRef.current.velocity = 0;
  }, []);

  const animate = useCallback(
    (mouseX: number, mouseY: number) => {
      const now = performance.now();
      const deltaTime = now - inertiaRef.current.lastTime;
      inertiaRef.current.lastTime = now;

      // フレーム間引き（重い環境対策）
      inertiaRef.current.frameCount++;
      if (config.frameSkip > 0 && inertiaRef.current.frameCount % config.frameSkip !== 0) {
        inertiaRef.current.animationId = requestAnimationFrame(() => 
          animate(mouseX, mouseY)
        );
        return;
      }

      const { velocity, targetZoom } = inertiaRef.current;
      
      if (Math.abs(velocity) < config.minZoomStep) {
        stopInertia();
        return;
      }

      // 慣性減衰
      inertiaRef.current.velocity *= config.inertiaFactor;
      const newZoom = Math.min(Math.max(targetZoom + velocity, 0.1), 5);
      inertiaRef.current.targetZoom = newZoom;

      // パンの調整（ズームの中心点を維持）
      const deltaZoom = newZoom - zoom;
      const newPanX = panX - (mouseX * deltaZoom) / zoom;
      const newPanY = panY - (mouseY * deltaZoom) / zoom;

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);

      inertiaRef.current.animationId = requestAnimationFrame(() => 
        animate(mouseX, mouseY)
      );
    },
    [zoom, panX, panY, setZoom, setPanX, setPanY, config, stopInertia]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (!config.enableInertia) {
        // 通常のズーム処理（パフォーマンス重視）
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 5);
        const deltaZoom = newZoom - zoom;
        const newPanX = panX - (mouseX * deltaZoom) / zoom;
        const newPanY = panY - (mouseY * deltaZoom) / zoom;

        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
        return;
      }

      // 慣性ズーム処理
      const zoomDirection = e.deltaY > 0 ? -1 : 1;
      const velocityIncrement = zoomDirection * 0.05;

      inertiaRef.current.velocity += velocityIncrement;
      inertiaRef.current.targetZoom = zoom;
      inertiaRef.current.lastTime = performance.now();
      inertiaRef.current.frameCount = 0;

      if (!inertiaRef.current.animationId) {
        inertiaRef.current.animationId = requestAnimationFrame(() =>
          animate(mouseX, mouseY)
        );
      }
    },
    [zoom, panX, panY, setZoom, setPanX, setPanY, config.enableInertia, animate]
  );

  return { handleWheel, stopInertia };
}