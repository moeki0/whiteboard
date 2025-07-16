import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateBounds, createVirtualContainer } from '../utils/clipboardUtils';

// DOM mocking
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn().mockImplementation((element) => ({
    left: element.style.left || '0px',
    top: element.style.top || '0px',
  })),
});

describe('clipboardUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBounds', () => {
    it('単一要素の境界を正しく計算する', () => {
      const mockElement = document.createElement('div');
      mockElement.style.left = '100px';
      mockElement.style.top = '200px';
      
      // getBoundingClientRect をモック
      mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 250,
        height: 150,
        left: 100,
        top: 200,
        right: 350,
        bottom: 350,
      });

      const bounds = calculateBounds([mockElement]);
      
      expect(bounds).toEqual({
        x: 100,
        y: 200,
        width: 250,
        height: 150,
      });
    });

    it('複数要素の境界を正しく計算する', () => {
      const element1 = document.createElement('div');
      element1.style.left = '100px';
      element1.style.top = '200px';
      element1.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 100,
        height: 100,
        left: 100,
        top: 200,
        right: 200,
        bottom: 300,
      });

      const element2 = document.createElement('div');
      element2.style.left = '300px';
      element2.style.top = '150px';
      element2.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 150,
        height: 120,
        left: 300,
        top: 150,
        right: 450,
        bottom: 270,
      });

      const bounds = calculateBounds([element1, element2]);
      
      expect(bounds).toEqual({
        x: 100,
        y: 150,
        width: 350, // 450 - 100
        height: 150, // 300 - 150
      });
    });

    it('空の配列の場合は無限大を返す', () => {
      const bounds = calculateBounds([]);
      
      expect(bounds).toEqual({
        x: Infinity,
        y: Infinity,
        width: -Infinity,
        height: -Infinity,
      });
    });
  });

  describe('createVirtualContainer', () => {
    it('正しいスタイルの仮想コンテナを作成する', () => {
      const mockElement = document.createElement('div');
      mockElement.style.left = '100px';
      mockElement.style.top = '200px';
      mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 100,
        height: 100,
      });

      const bounds = { x: 100, y: 200, width: 250, height: 150 };
      const container = createVirtualContainer([mockElement], bounds);
      
      expect(container.style.position).toBe('absolute');
      expect(container.style.left).toBe('-9999px');
      expect(container.style.top).toBe('-9999px');
      expect(container.style.width).toBe('250px');
      expect(container.style.height).toBe('150px');
      expect(container.style.background).toBe('rgb(245, 245, 245)');
    });

    it('要素のクローンを正しい相対位置で配置する', () => {
      const mockElement = document.createElement('div');
      mockElement.textContent = 'test content';
      mockElement.style.left = '150px';
      mockElement.style.top = '250px';
      mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 100,
        height: 100,
      });

      const bounds = { x: 100, y: 200, width: 250, height: 150 };
      const container = createVirtualContainer([mockElement], bounds);
      
      expect(container.children.length).toBe(1);
      
      const clonedElement = container.children[0] as HTMLElement;
      expect(clonedElement.textContent).toBe('test content');
      expect(clonedElement.style.position).toBe('absolute');
      expect(clonedElement.style.left).toBe('50px'); // 150 - 100
      expect(clonedElement.style.top).toBe('50px'); // 250 - 200
      expect(clonedElement.style.transform).toBe('none');
    });

    it('複数要素のクローンを正しく配置する', () => {
      const element1 = document.createElement('div');
      element1.textContent = 'element1';
      element1.style.left = '100px';
      element1.style.top = '200px';
      element1.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 100,
        height: 100,
      });

      const element2 = document.createElement('div');
      element2.textContent = 'element2';
      element2.style.left = '300px';
      element2.style.top = '150px';
      element2.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 150,
        height: 120,
      });

      const bounds = { x: 100, y: 150, width: 350, height: 150 };
      const container = createVirtualContainer([element1, element2], bounds);
      
      expect(container.children.length).toBe(2);
      
      const clonedElement1 = container.children[0] as HTMLElement;
      expect(clonedElement1.textContent).toBe('element1');
      expect(clonedElement1.style.left).toBe('0px'); // 100 - 100
      expect(clonedElement1.style.top).toBe('50px'); // 200 - 150

      const clonedElement2 = container.children[1] as HTMLElement;
      expect(clonedElement2.textContent).toBe('element2');
      expect(clonedElement2.style.left).toBe('200px'); // 300 - 100
      expect(clonedElement2.style.top).toBe('0px'); // 150 - 150
    });
  });
});