import React, { useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import { argbToHex, mapAlignment, getCellText } from '../utils/excelParser';

export interface SheetViewerProps {
  worksheet: any; // ExcelJS Worksheet object
  showGridlines: boolean;
}

export const SheetViewer: React.FC<SheetViewerProps> = ({ worksheet, showGridlines }) => {
  // 1. Calculate bounding box of cells with data
  const bounds = useMemo(() => {
    if (!worksheet) return { maxRow: 1, maxCol: 1 };
    
    let maxRow = 1;
    let maxCol = 1;
    
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber > maxRow) maxRow = rowNumber;
      row.eachCell((_cell: any, colNumber: number) => {
        if (colNumber > maxCol) maxCol = colNumber;
      });
    });
    
    // Add small buffer for display aesthetics
    return {
      maxRow: Math.min(maxRow + 3, worksheet.rowCount || 100),
      maxCol: Math.min(maxCol + 2, worksheet.columnCount || 26),
    };
  }, [worksheet]);

  // 2. Define row heights and column widths in pixels
  const { rowHeights, colWidths, totalWidth, totalHeight } = useMemo(() => {
    const heights: number[] = [];
    const widths: number[] = [];
    
    let wSum = 0;
    let hSum = 0;

    if (worksheet) {
      // Column Widths: 1-indexed
      for (let c = 1; c <= bounds.maxCol; c++) {
        const col = worksheet.getColumn(c);
        const w = col && col.width ? Math.round(col.width * 8 + 10) : 100;
        widths.push(w);
        wSum += w;
      }
      
      // Row Heights: 1-indexed
      for (let r = 1; r <= bounds.maxRow; r++) {
        const row = worksheet.getRow(r);
        const h = row && row.height ? Math.round(row.height * 1.33) : 22;
        heights.push(h);
        hSum += h;
      }
    }
    
    return {
      rowHeights: heights,
      colWidths: widths,
      totalWidth: wSum,
      totalHeight: hSum
    };
  }, [worksheet, bounds]);

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
        
        // Calculate image positions in pixels using colWidths and rowHeights
        const fromCol = img.range.from.col;
        const fromRow = img.range.from.row;
        const toCol = img.range.to.col;
        const toRow = img.range.to.row;
        
        // Convert EMU offsets to pixels (1 pixel = 9525 EMUs)
        const fromColOff = img.range.from.colOff ? Math.round(img.range.from.colOff / 9525) : 0;
        const fromRowOff = img.range.from.rowOff ? Math.round(img.range.from.rowOff / 9525) : 0;
        const toColOff = img.range.to.colOff ? Math.round(img.range.to.colOff / 9525) : 0;
        const toRowOff = img.range.to.rowOff ? Math.round(img.range.to.rowOff / 9525) : 0;
        
        // Left positioning
        let left = 0;
        for (let i = 0; i < fromCol && i < colWidths.length; i++) {
          left += colWidths[i]!;
        }
        left += fromColOff;
        
        // Top positioning
        let top = 0;
        for (let i = 0; i < fromRow && i < rowHeights.length; i++) {
          top += rowHeights[i]!;
        }
        top += fromRowOff;
        
        // Width calculation
        let width = 0;
        for (let i = fromCol; i <= toCol && i < colWidths.length; i++) {
          width += colWidths[i]!;
        }
        width = width - fromColOff + toColOff;
        
        // Height calculation
        let height = 0;
        for (let i = fromRow; i <= toRow && i < rowHeights.length; i++) {
          height += rowHeights[i]!;
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
      <div style={{ position: 'relative', width: `${totalWidth + 40}px`, height: `${totalHeight + 22}px` }}>
        
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
            <col style={{ width: '40px' }} />
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px` }} />
            ))}
          </colgroup>
          
          <thead>
            <tr>
              <th className="excel-hdr corner"></th>
              {Array.from({ length: bounds.maxCol }).map((_, c) => (
                <th key={c} className="excel-hdr col-header" style={{ height: '22px' }}>
                  {getColLetter(c + 1)}
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {Array.from({ length: bounds.maxRow }).map((_, rIndex) => {
              const r = rIndex + 1; // 1-indexed row
              const rowHeight = rowHeights[rIndex];
              
              return (
                <tr key={r} style={{ height: `${rowHeight}px` }}>
                  {/* Row number header */}
                  <td className="excel-hdr row-header">{r}</td>
                  
                  {Array.from({ length: bounds.maxCol }).map((_, cIndex) => {
                    const c = cIndex + 1; // 1-indexed column
                    const cell = worksheet.getCell(r, c);
                    
                    // Merged cell management
                    if (cell.isMerged && cell.master.address !== cell.address) {
                      return null; // Skip rendering, master cell handles it
                    }

                    // Calculate colSpan & rowSpan if it's the master cell of a merged range
                    let colSpan = 1;
                    let rowSpan = 1;
                    if (cell.isMerged && cell.master.address === cell.address) {
                      // Count columns merged
                      let nextC = c + 1;
                      while (nextC <= bounds.maxCol) {
                        const nextCell = worksheet.getCell(r, nextC);
                        if (nextCell.isMerged && nextCell.master.address === cell.address) {
                          colSpan++;
                          nextC++;
                        } else {
                          break;
                        }
                      }
                      
                      // Count rows merged
                      let nextR = r + 1;
                      while (nextR <= bounds.maxRow) {
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
                      if (cell.font.size) cellStyle.fontSize = `${Math.min(cell.font.size, 16)}px`;
                      const fontColorHex = argbToHex(cell.font.color?.argb || cell.font.color);
                      if (fontColorHex) {
                        cellStyle.color = fontColorHex;
                      }
                      if (cell.font.underline) {
                        cellStyle.textDecoration = 'underline';
                      }
                    }
                    
                    // Map alignment
                    const alignStyle = mapAlignment(cell.alignment);
                    Object.assign(cellStyle, alignStyle);

                    // Get value to display
                    const displayValue = getCellText(cell);

                    return (
                      <td
                        key={c}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        className="excel-cell"
                        style={cellStyle}
                        title={displayValue}
                      >
                        {displayValue}
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
  );
};
