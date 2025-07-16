import html2canvas from 'html2canvas';

export interface CopyToClipboardOptions {
  backgroundColor?: string;
  scale?: number;
  useCORS?: boolean;
  allowTaint?: boolean;
}

/**
 * 単一の付箋をクリップボードに画像としてコピー
 */
export async function copyStickyNoteToClipboard(
  noteId: string, 
  options: CopyToClipboardOptions = {}
): Promise<boolean> {
  try {
    const noteElement = document.querySelector(`[data-note-id="${noteId}"]`) as HTMLElement;
    if (!noteElement) {
      return false;
    }

    const canvas = await html2canvas(noteElement, {
      backgroundColor: options.backgroundColor || '#ffffff',
      scale: options.scale || 2,
      useCORS: options.useCORS ?? true,
      allowTaint: options.allowTaint ?? true,
      logging: false,
      onclone: (clonedDoc: Document) => {
        // クローンされたDOM内でスタイルを変更
        const clonedElement = clonedDoc.querySelector(`[data-note-id="${noteId}"]`) as HTMLElement;
        if (clonedElement) {
          // アクティブ・選択状態のスタイルを削除
          clonedElement.classList.remove('active', 'selected');
          // 通常のボーダーを適用
          clonedElement.style.border = '1px solid #cccccc';
          clonedElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.05)';
        }
      }
    } as any);

    return await copyCanvasToClipboard(canvas);
  } catch (error) {
    return false;
  }
}

/**
 * 複数の付箋をまとめてクリップボードに画像としてコピー
 */
export async function copyMultipleStickyNotesToClipboard(
  noteIds: string[], 
  options: CopyToClipboardOptions = {}
): Promise<boolean> {
  try {
    if (noteIds.length === 0) {
      return false;
    }

    // 複数の付箋要素を取得
    const noteElements = noteIds.map(id => 
      document.querySelector(`[data-note-id="${id}"]`) as HTMLElement
    ).filter(Boolean);

    if (noteElements.length === 0) {
      return false;
    }

    // 付箋の位置とサイズを計算
    const bounds = calculateBounds(noteElements);
    
    // 仮想コンテナを作成
    const container = createVirtualContainer(noteElements, bounds);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        useCORS: options.useCORS ?? true,
        allowTaint: options.allowTaint ?? true,
        logging: false,
        width: bounds.width,
        height: bounds.height,
        onclone: (clonedDoc: Document) => {
          // クローンされたコンテナ内の全ての付箋のスタイルを変更
          const clonedNotes = clonedDoc.querySelectorAll('.sticky-note');
          clonedNotes.forEach((note) => {
            const htmlNote = note as HTMLElement;
            // アクティブ・選択状態のスタイルを削除
            htmlNote.classList.remove('active', 'selected');
            // 通常のボーダーを適用
            htmlNote.style.border = '1px solid #cccccc';
            htmlNote.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.05)';
          });
        }
      } as any);

      return await copyCanvasToClipboard(canvas);
    } finally {
      // 仮想コンテナを削除
      document.body.removeChild(container);
    }
  } catch (error) {
    return false;
  }
}

/**
 * Canvasをクリップボードにコピー
 */
async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }

      try {
        if (navigator.clipboard && window.ClipboardItem) {
          // Modern clipboard API
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          resolve(true);
        } else {
          // Fallback: create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'sticky-notes.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve(true);
        }
      } catch (error) {
        // Try fallback method
        try {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'sticky-notes.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve(true);
        } catch (fallbackError) {
          resolve(false);
        }
      }
    }, 'image/png');
  });
}

/**
 * 複数要素の境界を計算
 */
export function calculateBounds(elements: HTMLElement[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach(element => {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const x = parseInt(computedStyle.left || '0', 10);
    const y = parseInt(computedStyle.top || '0', 10);
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + rect.width);
    maxY = Math.max(maxY, y + rect.height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 仮想コンテナを作成
 */
export function createVirtualContainer(elements: HTMLElement[], bounds: { x: number; y: number; width: number; height: number }): HTMLElement {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = `${bounds.width}px`;
  container.style.height = `${bounds.height}px`;
  container.style.background = '#f5f5f5';
  container.style.overflow = 'visible';

  elements.forEach(element => {
    const clone = element.cloneNode(true) as HTMLElement;
    const computedStyle = window.getComputedStyle(element);
    const x = parseInt(computedStyle.left || '0', 10);
    const y = parseInt(computedStyle.top || '0', 10);

    // 相対位置に調整
    clone.style.position = 'absolute';
    clone.style.left = `${x - bounds.x}px`;
    clone.style.top = `${y - bounds.y}px`;
    clone.style.transform = 'none';

    container.appendChild(clone);
  });

  return container;
}