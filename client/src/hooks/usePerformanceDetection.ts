import { useState, useEffect, useRef } from "react";

interface PerformanceMetrics {
  cpuScore: number;
  memoryGB: number;
  cpuCores: number;
  averageFPS: number;
  isHighPerformance: boolean;
  isMediumPerformance: boolean;
  isLowPerformance: boolean;
}

export function usePerformanceDetection(): PerformanceMetrics {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    cpuScore: 0,
    memoryGB: 4,
    cpuCores: 4,
    averageFPS: 60,
    isHighPerformance: true,
    isMediumPerformance: false,
    isLowPerformance: false,
  });

  const fpsRef = useRef({
    frameCount: 0,
    lastTime: performance.now(),
    fps: 60,
    fpsHistory: [] as number[],
  });

  // CPU性能測定
  const measureCPUPerformance = (): number => {
    const iterations = 100000;
    const start = performance.now();
    
    // 計算集約的なタスク
    let result = 0;
    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(Math.random() * 1000) * Math.sin(i);
    }
    
    const duration = performance.now() - start;
    return duration; // 時間が短いほど高性能
  };

  // FPS監視
  const updateFPS = () => {
    fpsRef.current.frameCount++;
    const now = performance.now();
    
    if (now - fpsRef.current.lastTime >= 1000) {
      fpsRef.current.fps = fpsRef.current.frameCount;
      fpsRef.current.frameCount = 0;
      fpsRef.current.lastTime = now;
      
      // FPS履歴を保持（最新5秒分）
      fpsRef.current.fpsHistory.push(fpsRef.current.fps);
      if (fpsRef.current.fpsHistory.length > 5) {
        fpsRef.current.fpsHistory.shift();
      }
    }
    
    requestAnimationFrame(updateFPS);
  };

  useEffect(() => {
    // 初期性能測定
    const cpuScore = measureCPUPerformance();
    const memoryGB = (navigator as any).deviceMemory || 4;
    const cpuCores = navigator.hardwareConcurrency || 4;

    // FPS監視開始
    requestAnimationFrame(updateFPS);

    // 性能判定のための初期値設定
    setTimeout(() => {
      const averageFPS = fpsRef.current.fpsHistory.length > 0 
        ? fpsRef.current.fpsHistory.reduce((a, b) => a + b, 0) / fpsRef.current.fpsHistory.length
        : 60;

      // 性能分類の判定
      const isHighPerformance = (
        cpuScore < 30 && // CPU性能が良い（時間が短い）
        memoryGB >= 8 && 
        cpuCores >= 6 && 
        averageFPS >= 55
      );

      const isLowPerformance = (
        cpuScore > 80 || // CPU性能が悪い
        memoryGB < 4 || 
        cpuCores < 4 || 
        averageFPS < 30
      );

      const isMediumPerformance = !isHighPerformance && !isLowPerformance;

      setMetrics({
        cpuScore,
        memoryGB,
        cpuCores,
        averageFPS,
        isHighPerformance,
        isMediumPerformance,
        isLowPerformance,
      });
    }, 2000); // 2秒後に判定（FPSデータを収集するため）

  }, []);

  // リアルタイムFPS更新
  useEffect(() => {
    const interval = setInterval(() => {
      if (fpsRef.current.fpsHistory.length > 0) {
        const averageFPS = fpsRef.current.fpsHistory.reduce((a, b) => a + b, 0) / fpsRef.current.fpsHistory.length;
        
        setMetrics(prev => ({
          ...prev,
          averageFPS,
          // FPSの変化に基づいて動的に性能を再評価
          isLowPerformance: prev.isLowPerformance || averageFPS < 25,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}