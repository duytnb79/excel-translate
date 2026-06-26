import React, { useMemo, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { EyeOff } from 'lucide-react';
import { argbToHex, mapAlignment, getCellText } from '../utils/excelParser';

export interface SheetViewerProps {
  worksheet: any; // ExcelJS Worksheet object
  originalWorksheet?: any; // ExcelJS Worksheet object for original text hover
  translatedWorksheet?: any; // ExcelJS Worksheet object for translated text copy
  showGridlines: boolean;
  zoomLevel: number;
  fontSizeOffset?: number;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export interface SheetViewerRef {
  autoFitAll: () => void;
  resetAll: () => void;
}

export const SheetViewer = forwardRef<SheetViewerRef, SheetViewerProps>(({ 
  worksheet, 
  originalWorksheet, 
  translatedWorksheet,
  showGridlines, 
  zoomLevel,
  fontSizeOffset = 0,
  onShowToast
}, ref) => {
  // Tooltip hover state
  const [hoveredCell, setHoveredCell] = useState<{
    text: string;
    rect: DOMRect;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    row: number;
    col: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    row: 0,
    col: 0
  });

  // Handle cell context menu (right click)
  const handleCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    
    const menuWidth = 160;
    const menuHeight = 70;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > viewportWidth) {
      posX = viewportWidth - menuWidth - 8;
    }
    if (posY + menuHeight > viewportHeight) {
      posY = viewportHeight - menuHeight - 8;
    }

    setContextMenu({
      visible: true,
      x: posX,
      y: posY,
      row: r,
      col: c
    });
  };

  // Handle text copying
  const handleCopy = async (type: 'original' | 'translated') => {
    const r = contextMenu.row;
    const c = contextMenu.col;
    
    setContextMenu(prev => ({ ...prev, visible: false }));

    if (!worksheet) return;

    let textToCopy = '';
    
    if (type === 'original') {
      const origCell = originalWorksheet ? originalWorksheet.getCell(r, c) : worksheet.getCell(r, c);
      textToCopy = getCellText(origCell);
    } else {
      const transCell = translatedWorksheet ? translatedWorksheet.getCell(r, c) : null;
      if (transCell) {
        textToCopy = getCellText(transCell);
      } else {
        if (onShowToast) {
          onShowToast('Không có bản dịch cho ô này.', 'error');
        }
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      if (onShowToast) {
        onShowToast(type === 'original' ? 'Đã copy bản gốc!' : 'Đã copy bản dịch!');
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      if (onShowToast) {
        onShowToast('Không thể copy vào clipboard.', 'error');
      }
    }
  };

  // Click outside / Scroll / Escape keydown event listeners to close menu
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleDismiss = (e: Event) => {
      const menuEl = document.getElementById('sheet-cell-context-menu');
      if (menuEl && menuEl.contains(e.target as Node)) {
        return;
      }
      setContextMenu(prev => ({ ...prev, visible: false }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    window.addEventListener('click', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);


  // 1. Calculate bounding box of cells with data and images
  const bounds = useMemo(() => {
    if (!worksheet) return { maxRow: 1, maxCol: 1, actualMaxRow: 1, actualMaxCol: 1 };
    
    let maxRow = 1;
    let maxCol = 1;
    
    // Check cell positions
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber > maxRow) maxRow = rowNumber;
      row.eachCell((_cell: any, colNumber: number) => {
        if (colNumber > maxCol) maxCol = colNumber;
      });
    });

    // Check image positions to prevent cutoffs
    try {
      const wsImages = worksheet.getImages();
      if (wsImages && wsImages.length > 0) {
        wsImages.forEach((img: any) => {
          const tl = img.range.tl || img.range.from;
          const br = img.range.br || img.range.to;
          if (tl) {
            const fromRow = Math.ceil(tl.row) + 1;
            const fromCol = Math.ceil(tl.col) + 1;
            if (fromRow > maxRow) maxRow = fromRow;
            if (fromCol > maxCol) maxCol = fromCol;
          }
          if (br) {
            const toRow = Math.ceil(br.row) + 1;
            const toCol = Math.ceil(br.col) + 1;
            if (toRow > maxRow) maxRow = toRow;
            if (toCol > maxCol) maxCol = toCol;
          }
        });
      }
    } catch (e) {
      console.warn('Error checking image bounds:', e);
    }
    
    // Ensure we render at least 15 rows/cols, with a 100 row and 30 column buffer for spacing & images
    return {
      actualMaxRow: maxRow,
      actualMaxCol: maxCol,
      maxRow: Math.max(maxRow + 100, 15),
      maxCol: Math.max(maxCol + 30, 15),
    };
  }, [worksheet]);

  // 2. Define resizable row heights and column widths in pixels
  let [colWidths, setColWidths] = useState<number[]>([]);
  let [rowHeights, setRowHeights] = useState<number[]>([]);
  const [prevKey, setPrevKey] = useState<string>('');
  const [isResizing, setIsResizing] = useState(false);

  const currentKey = `${worksheet ? worksheet.id || worksheet.name || 'sheet' : ''}_${bounds.maxRow}_${bounds.maxCol}`;

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    const widths: number[] = [];
    const heights: number[] = [];
    if (worksheet) {
      for (let c = 1; c <= bounds.maxCol; c++) {
        const col = worksheet.getColumn(c);
        widths.push(col && col.width ? Math.round(col.width * 8 + 10) : 80);
      }
      for (let r = 1; r <= bounds.maxRow; r++) {
        const row = worksheet.getRow(r);
        heights.push(row && row.height ? Math.round(row.height * 1.33) : 20);
      }
    }
    setColWidths(widths);
    setRowHeights(heights);
    colWidths = widths;
    rowHeights = heights;
  }

  const totalWidth = useMemo(() => {
    return colWidths.reduce((sum, w) => sum + w, 0);
  }, [colWidths]);

  const totalHeight = useMemo(() => {
    return rowHeights.reduce((sum, h) => sum + h, 0);
  }, [rowHeights]);

  // Handler for column resizing
  const startColResize = (e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = colWidths[colIndex] || 80;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoomLevel;
      const newWidth = Math.max(30, Math.round(startWidth + deltaX));
      setColWidths((prev) => {
        const updated = [...prev];
        updated[colIndex] = newWidth;
        return updated;
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handler for row resizing
  const startRowResize = (e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = rowHeights[rowIndex] || 20;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = (moveEvent.clientY - startY) / zoomLevel;
      const newHeight = Math.max(15, Math.round(startHeight + deltaY));
      setRowHeights((prev) => {
        const updated = [...prev];
        updated[rowIndex] = newHeight;
        return updated;
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handler for column double click (Auto-fit or reset to initial width)
  const handleColDoubleClick = (colIndex: number) => {
    if (!worksheet) return;
    
    const col = worksheet.getColumn(colIndex + 1);
    const initialWidth = col && col.width ? Math.round(col.width * 8 + 10) : 80;
    
    const c = colIndex + 1;
    let maxLen = 0;
    for (let r = 1; r <= bounds.actualMaxRow; r++) {
      const cell = worksheet.getCell(r, c);
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      const text = getCellText(cell);
      if (text) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.length > maxLen) maxLen = line.length;
        }
      }
    }
    
    const autoFitWidth = maxLen > 0 ? Math.max(80, Math.min(350, Math.round(maxLen * 7.5 + 20))) : 80;
    
    setColWidths((prev) => {
      const updated = [...prev];
      const currentWidth = updated[colIndex] ?? initialWidth;
      if (Math.abs(currentWidth - autoFitWidth) < 2 && currentWidth !== initialWidth) {
        updated[colIndex] = initialWidth;
      } else {
        updated[colIndex] = autoFitWidth;
      }
      return updated;
    });
  };

  // Handler for row double click (Auto-fit or reset to initial height)
  const handleRowDoubleClick = (rowIndex: number) => {
    if (!worksheet) return;
    
    const row = worksheet.getRow(rowIndex + 1);
    const initialHeight = row && row.height ? Math.round(row.height * 1.33) : 20;
    
    const r = rowIndex + 1;
    let maxLines = 1;
    let hasBold = false;
    for (let c = 1; c <= bounds.actualMaxCol; c++) {
      const cell = worksheet.getCell(r, c);
      if (cell.isMerged && cell.master.address !== cell.address) continue;
      const text = getCellText(cell);
      if (text) {
        const lineCount = text.split('\n').length;
        if (lineCount > maxLines) maxLines = lineCount;
        if (cell.font && cell.font.bold) hasBold = true;
      }
    }
    
    const lineHeight = hasBold ? 18 : 16;
    const autoFitHeight = Math.max(20, maxLines * lineHeight + 8);
    
    setRowHeights((prev) => {
      const updated = [...prev];
      const currentHeight = updated[rowIndex] ?? initialHeight;
      if (Math.abs(currentHeight - autoFitHeight) < 2 && currentHeight !== initialHeight) {
        updated[rowIndex] = initialHeight;
      } else {
        updated[rowIndex] = autoFitHeight;
      }
      return updated;
    });
  };

  // Expose autoFitAll and resetAll to ref
  useImperativeHandle(ref, () => ({
    autoFitAll: () => {
      if (!worksheet) return;
      const newWidths = [...colWidths];
      for (let cIndex = 0; cIndex < bounds.actualMaxCol; cIndex++) {
        const c = cIndex + 1;
        let maxLen = 0;
        for (let r = 1; r <= bounds.actualMaxRow; r++) {
          const cell = worksheet.getCell(r, c);
          if (cell.isMerged && cell.master.address !== cell.address) continue;
          const text = getCellText(cell);
          if (text) {
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.length > maxLen) maxLen = line.length;
            }
          }
        }
        newWidths[cIndex] = maxLen > 0 ? Math.max(80, Math.min(350, Math.round(maxLen * 7.5 + 20))) : 80;
      }
      setColWidths(newWidths);

      const newHeights = [...rowHeights];
      for (let rIndex = 0; rIndex < bounds.actualMaxRow; rIndex++) {
        const r = rIndex + 1;
        let maxLines = 1;
        let hasBold = false;
        for (let c = 1; c <= bounds.actualMaxCol; c++) {
          const cell = worksheet.getCell(r, c);
          if (cell.isMerged && cell.master.address !== cell.address) continue;
          const text = getCellText(cell);
          if (text) {
            const lineCount = text.split('\n').length;
            if (lineCount > maxLines) maxLines = lineCount;
            if (cell.font && cell.font.bold) hasBold = true;
          }
        }
        const lineHeight = hasBold ? 18 : 16;
        newHeights[rIndex] = Math.max(20, maxLines * lineHeight + 8);
      }
      setRowHeights(newHeights);
    },
    
    resetAll: () => {
      if (!worksheet) return;
      const widths: number[] = [];
      const heights: number[] = [];
      for (let c = 1; c <= bounds.maxCol; c++) {
        const col = worksheet.getColumn(c);
        widths.push(col && col.width ? Math.round(col.width * 8 + 10) : 80);
      }
      for (let r = 1; r <= bounds.maxRow; r++) {
        const row = worksheet.getRow(r);
        heights.push(row && row.height ? Math.round(row.height * 1.33) : 20);
      }
      setColWidths(widths);
      setRowHeights(heights);
    }
  }));

  // 3. Extract and map images from worksheet
  const images = useMemo(() => {
    if (!worksheet || !worksheet.workbook) return [];
    
    const wsImages = worksheet.getImages();
    if (!wsImages || wsImages.length === 0) return [];
    
    return wsImages.map((img: any) => {
      try {
        const imageObj = worksheet.workbook.getImage(img.imageId);
        if (!imageObj) return null;
        
        // Convert buffer to dataUrl
        const blob = new Blob([imageObj.buffer], { type: `image/${imageObj.extension}` });
        const dataUrl = URL.createObjectURL(blob);
        
        // Support both tl/br and from/to range formats in ExcelJS
        const tl = img.range.tl || img.range.from;
        const br = img.range.br || img.range.to;
        if (!tl) return null;

        const fromCol = tl.col;
        const fromRow = tl.row;
        const toCol = br ? br.col : fromCol + 2;
        const toRow = br ? br.row : fromRow + 5;

        // Convert EMU offsets to pixels (1 pixel = 9525 EMUs)
        const fromColOff = tl.colOff ? Math.round(tl.colOff / 9525) : 0;
        const fromRowOff = tl.rowOff ? Math.round(tl.rowOff / 9525) : 0;
        const toColOff = (br && br.colOff) ? Math.round(br.colOff / 9525) : 0;
        const toRowOff = (br && br.rowOff) ? Math.round(br.rowOff / 9525) : 0;

        // Left positioning (supports fractional column positions)
        let left = 0;
        const startColInt = Math.floor(fromCol);
        const startColFrac = fromCol - startColInt;
        for (let i = 0; i < startColInt && i < colWidths.length; i++) {
          left += colWidths[i]!;
        }
        if (startColInt < colWidths.length) {
          left += colWidths[startColInt]! * startColFrac;
        }
        left += fromColOff;

        // Top positioning (supports fractional row positions)
        let top = 0;
        const startRowInt = Math.floor(fromRow);
        const startRowFrac = fromRow - startRowInt;
        for (let i = 0; i < startRowInt && i < rowHeights.length; i++) {
          top += rowHeights[i]!;
        }
        if (startRowInt < rowHeights.length) {
          top += rowHeights[startRowInt]! * startRowFrac;
        }
        top += fromRowOff;

        // Width calculation (supports fractional widths)
        let width = 0;
        const endColInt = Math.floor(toCol);
        if (startColInt === endColInt) {
          if (startColInt < colWidths.length) {
            width = colWidths[startColInt]! * (toCol - fromCol);
          }
        } else {
          if (startColInt < colWidths.length) {
            width += colWidths[startColInt]! * (1 - startColFrac);
          }
          for (let i = startColInt + 1; i < endColInt && i < colWidths.length; i++) {
            width += colWidths[i]!;
          }
          if (endColInt < colWidths.length) {
            width += colWidths[endColInt]! * (toCol - endColInt);
          }
        }
        width = width - fromColOff + toColOff;

        // Height calculation (supports fractional heights)
        let height = 0;
        const endRowInt = Math.floor(toRow);
        if (startRowInt === endRowInt) {
          if (startRowInt < rowHeights.length) {
            height = rowHeights[startRowInt]! * (toRow - fromRow);
          }
        } else {
          if (startRowInt < rowHeights.length) {
            height += rowHeights[startRowInt]! * (1 - startRowFrac);
          }
          for (let i = startRowInt + 1; i < endRowInt && i < rowHeights.length; i++) {
            height += rowHeights[i]!;
          }
          if (endRowInt < rowHeights.length) {
            height += rowHeights[endRowInt]! * (toRow - endRowInt);
          }
        }
        height = height - fromRowOff + toRowOff;
        
        return {
          id: img.imageId,
          src: dataUrl,
          style: {
            left: `${left + 40}px`, // +40px to offset the row index header column (40px)
            top: `${top + 22}px`,  // +22px to offset the col index header row (22px)
            width: `${width}px`,
            height: `${height}px`,
          }
        };
      } catch (err) {
        console.error('Error processing image:', err);
        return null;
      }
    }).filter(Boolean);
  }, [worksheet, colWidths, rowHeights]);

  // Convert Column Index (1-based) to Letter (A, B, C...)
  const getColLetter = (index: number): string => {
    let temp = index;
    let letter = '';
    while (temp > 0) {
      const modulo = (temp - 1) % 26;
      letter = String.fromCharCode(65 + modulo) + letter;
      temp = Math.floor((temp - modulo) / 26);
    }
    return letter;
  };

  if (!worksheet) {
    return (
      <div className="sheet-empty-state">
        <EyeOff size={32} />
        <p>Không có dữ liệu bảng tính</p>
      </div>
    );
  }

  return (
    <div className="sheet-container">
      {/* Outer bounding wrapper with scaled width/height to support custom viewport scrolling */}
      <div 
        style={{ 
          width: `${(totalWidth + 40) * zoomLevel}px`, 
          height: `${(totalHeight + 22) * zoomLevel}px`,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Inner scaled canvas */}
        <div 
          style={{ 
            position: 'absolute', 
            left: 0, 
            top: 0, 
            width: `${totalWidth + 40}px`, 
            height: `${totalHeight + 22}px`,
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left'
          }}
        >
          
          {/* Render images absolute overlays */}
          {images.map((img: any) => (
            <div key={img.id} className="sheet-image-overlay" style={img.style}>
              <img src={img.src} alt="Spreadsheet Attachment" />
            </div>
          ))}

          <table 
            className={`excel-table ${showGridlines ? '' : 'no-gridlines'}`}
            style={{ width: `${totalWidth + 40}px` }}
          >
          <colgroup>
            {/* The Row Header Column */}
            <col style={{ width: '40px', minWidth: '40px' }} />
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px`, minWidth: `${w}px` }} />
            ))}
          </colgroup>
          
          <thead>
            <tr>
              <th className="excel-hdr corner" style={{ width: '40px', minWidth: '40px', height: '22px' }}></th>
              {Array.from({ length: bounds.maxCol }).map((_, c) => {
                const w = colWidths[c] || 80;
                return (
                  <th 
                    key={c} 
                    className="excel-hdr col-header resizable-hdr" 
                    style={{ 
                      width: `${w}px`, 
                      minWidth: `${w}px`,
                      maxWidth: `${w}px`,
                      height: '22px',
                      position: 'relative'
                    }}
                  >
                    {getColLetter(c + 1)}
                    <div 
                      className="col-resize-handle"
                      onMouseDown={(e) => startColResize(e, c)}
                      onDoubleClick={() => handleColDoubleClick(c)}
                      title="Nhấp đúp chuột để tự động căn chỉnh vừa văn bản hoặc khôi phục kích thước ban đầu"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          
          <tbody>
            {Array.from({ length: bounds.maxRow }).map((_, rIndex) => {
              const r = rIndex + 1; // 1-indexed row
              const rowHeight = rowHeights[rIndex];
              
              // Calculate dynamic column overflows for this row
              const overflowSpans = new Array(bounds.maxCol + 1).fill(1);
              const overflowSkips = new Array(bounds.maxCol + 1).fill(false);
              
              if (worksheet && r <= bounds.actualMaxRow) {
                for (let c = 1; c <= bounds.actualMaxCol; c++) {
                  const cell = worksheet.getCell(r, c);
                  if (cell.isMerged && cell.master.address !== cell.address) {
                    continue;
                  }
                  
                  if (overflowSkips[c]) {
                    continue;
                  }
                  
                  const val = getCellText(cell);
                  if (val !== '') {
                    let colSpan = 1;
                    if (cell.isMerged && cell.master.address === cell.address) {
                      let nextC = c + 1;
                      while (nextC <= bounds.actualMaxCol) {
                        const nextCell = worksheet.getCell(r, nextC);
                        if (nextCell.isMerged && nextCell.master.address === cell.address) {
                          colSpan++;
                          nextC++;
                        } else {
                          break;
                        }
                      }
                    } else {
                      let nextC = c + 1;
                      while (nextC <= bounds.actualMaxCol) {
                        const nextCell = worksheet.getCell(r, nextC);
                        const nextVal = getCellText(nextCell);
                        if (nextVal === '' && !nextCell.isMerged) {
                          colSpan++;
                          nextC++;
                        } else {
                          break;
                        }
                      }
                    }
                    
                    overflowSpans[c] = colSpan;
                    for (let i = c + 1; i < c + colSpan; i++) {
                      overflowSkips[i] = true;
                    }
                  }
                }
              }

              return (
                <tr key={r} style={{ height: `${rowHeight}px` }}>
                  {/* Row number header */}
                  <td 
                    className="excel-hdr row-header resizable-hdr"
                    style={{ position: 'relative' }}
                  >
                    {r}
                    <div 
                      className="row-resize-handle"
                      onMouseDown={(e) => startRowResize(e, rIndex)}
                      onDoubleClick={() => handleRowDoubleClick(rIndex)}
                      title="Nhấp đúp chuột để tự động căn chỉnh vừa văn bản hoặc khôi phục kích thước ban đầu"
                    />
                  </td>
                  
                  {Array.from({ length: bounds.maxCol }).map((_, cIndex) => {
                    const c = cIndex + 1; // 1-indexed column
                    const isBufferCell = r > bounds.actualMaxRow || c > bounds.actualMaxCol;

                    if (isBufferCell) {
                      return (
                        <td
                          key={c}
                          className="excel-cell"
                          style={{ fontSize: `${12 + fontSizeOffset}px` }}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {''}
                        </td>
                      );
                    }

                    const cell = worksheet.getCell(r, c);
                    
                    // Merged cell management
                    if (cell.isMerged && cell.master.address !== cell.address) {
                      return null; // Skip rendering, master cell handles it
                    }

                    // Skip cells consumed by left cell text overflow
                    if (overflowSkips[c]) {
                      return null;
                    }

                    const colSpan = overflowSpans[c];

                    // Count rows merged (rowSpan)
                    let rowSpan = 1;
                    if (cell.isMerged && cell.master.address === cell.address) {
                      let nextR = r + 1;
                      while (nextR <= bounds.actualMaxRow) {
                        const nextCell = worksheet.getCell(nextR, c);
                        if (nextCell.isMerged && nextCell.master.address === cell.address) {
                          rowSpan++;
                          nextR++;
                        } else {
                          break;
                        }
                      }
                    }

                    // Parse styles
                    const cellStyle: React.CSSProperties = {};
                    
                    // Map background color
                    if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
                      const colorHex = argbToHex(cell.fill.fgColor?.argb || cell.fill.fgColor);
                      if (colorHex) {
                        cellStyle.backgroundColor = colorHex;
                      }
                    }
                    
                    // Map Font styles
                    if (cell.font) {
                      if (cell.font.bold) cellStyle.fontWeight = 'bold';
                      if (cell.font.italic) cellStyle.fontStyle = 'italic';
                      
                      const baseFontSize = cell.font.size ? Math.min(cell.font.size, 16) : 12;
                      cellStyle.fontSize = `${baseFontSize + fontSizeOffset}px`;
                      
                      const fontColorHex = argbToHex(cell.font.color?.argb || cell.font.color);
                      if (fontColorHex) {
                        cellStyle.color = fontColorHex;
                      }
                      if (cell.font.underline) {
                        cellStyle.textDecoration = 'underline';
                      }
                    } else {
                      cellStyle.fontSize = `${12 + fontSizeOffset}px`;
                    }
                    
                    // Get value to display
                    const displayValue = getCellText(cell);

                    // Map alignment
                    const alignStyle = mapAlignment(cell.alignment);
                    Object.assign(cellStyle, alignStyle);

                    // Force pre-wrap if displayValue contains a newline
                    if (displayValue && displayValue.includes('\n')) {
                      cellStyle.whiteSpace = 'pre-wrap';
                      cellStyle.wordBreak = 'break-word';
                    }

                    // Get original text for comparison
                    const origCell = originalWorksheet ? originalWorksheet.getCell(r, c) : null;
                    const origText = origCell ? getCellText(origCell) : '';

                    // Check if cell is translated
                    const isTranslated = origText && origText !== displayValue;

                    // Handle hyperlinks rendering
                    const isHyperlink = cell.value && typeof cell.value === 'object' && cell.value.hyperlink;
                    const cellContent = isHyperlink ? (
                      <a
                        href={cell.value.hyperlink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cell-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {displayValue}
                      </a>
                    ) : displayValue;

                    return (
                      <td
                        key={c}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        className={`excel-cell ${isTranslated ? 'translated-cell-hover' : ''}`}
                        style={cellStyle}
                        title={isTranslated ? undefined : displayValue}
                        onMouseEnter={(e) => {
                          if (!isResizing && isTranslated && origText) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredCell({
                              text: origText,
                              rect
                            });
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredCell(null);
                        }}
                        onContextMenu={(e) => handleCellContextMenu(e, r, c)}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

      {hoveredCell && (
        <div 
          className="cell-hover-tooltip"
          style={{
            position: 'fixed',
            left: `${hoveredCell.rect.left + hoveredCell.rect.width / 2}px`,
            top: `${hoveredCell.rect.top - 6}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        > 
          <div className="tooltip-content">{hoveredCell.text}</div>
          <div className="tooltip-arrow" />
        </div>
      )}

      {contextMenu.visible && (
        <div
          id="sheet-cell-context-menu"
          className="custom-context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => handleCopy('original')}
          >
            Copy bản gốc
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => handleCopy('translated')}
            disabled={!translatedWorksheet}
            title={!translatedWorksheet ? 'Chưa có bản dịch' : undefined}
          >
            Copy bản dịch
          </button>
        </div>
      )}
    </div>
  );
});
