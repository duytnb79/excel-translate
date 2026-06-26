import React from 'react';

/**
 * Clean text helper - returns true if the string needs translation
 */
export function needsTranslation(text: any): boolean {
  if (text === null || text === undefined) return false;
  const str = String(text).trim();
  if (str === '') return false;
  
  // Skip numbers, dates, formulas, or purely punctuation strings
  if (/^[-+]?[0-9]*\.?[0-9]+$/.test(str)) return false;
  if (/^[#\-\+\=\*\/\%\!\@\(\)\{\}\[\]\:\;\,\.\?\s]+$/.test(str)) return false;
  
  return true;
}

/**
 * Convert ARGB color to CSS Hex color
 */
export function argbToHex(argb: any): string | undefined {
  if (!argb) return undefined;
  if (typeof argb === 'string') {
    if (argb.length === 8) {
      return `#${argb.slice(2)}`;
    }
    if (argb.length === 6) {
      return `#${argb}`;
    }
  }
  
  if (typeof argb === 'object' && argb.theme !== undefined) {
    const themeColors: { [key: number]: string } = {
      0: '#ffffff',
      1: '#000000',
      2: '#eeece1',
      3: '#1f497d',
      4: '#4f81bd',
      5: '#c0504d',
      6: '#9bbb59',
      7: '#8064a2',
      8: '#4bacc6',
      9: '#f79646',
    };
    return themeColors[argb.theme] || undefined;
  }
  return undefined;
}

/**
 * Helper to map alignment formats to standard CSS React styles
 */
export function mapAlignment(alignment: any): React.CSSProperties {
  if (!alignment) return {};
  const styles: React.CSSProperties = {};
  if (alignment.horizontal) {
    styles.textAlign = alignment.horizontal === 'justify' ? 'justify' : alignment.horizontal;
  }
  if (alignment.vertical) {
    styles.verticalAlign = alignment.vertical === 'middle' ? 'middle' : alignment.vertical;
  }
  if (alignment.wrapText) {
    styles.whiteSpace = 'normal';
    styles.wordBreak = 'break-word';
  }
  return styles;
}

/**
 * Retrieve display-ready string representation of a cell
 */
export function getCellText(cell: any): string {
  try {
    if (!cell) return '';
    const val = cell.value;
    if (val === null || val === undefined) return '';
    
    if (typeof val === 'object') {
      // If it's a Date object
      if (val instanceof Date) {
        return val.toLocaleDateString();
      }
      
      // If it's a formula result cell: { formula: '...', result: ... }
      if (val.result !== undefined) {
        if (val.result && typeof val.result === 'object') {
          if (val.result.richText) {
            return val.result.richText.map((t: any) => t?.text || '').join('');
          }
          return String(val.result.value !== undefined ? val.result.value : JSON.stringify(val.result));
        }
        return String(val.result);
      }
      
      // If it's a rich text cell: { richText: [...] }
      if (val.richText) {
        return val.richText.map((t: any) => t?.text || '').join('');
      }
      
      // If it's a hyperlink cell: { text: '...', hyperlink: '...' }
      if (val.text && val.hyperlink) {
        return String(val.text);
      }
      
      // If it's a nested value object: { value: ... }
      if (val.value !== undefined) {
        if (val.value && typeof val.value === 'object') {
          if (val.value.richText) {
            return val.value.richText.map((t: any) => t?.text || '').join('');
          }
          return JSON.stringify(val.value);
        }
        return String(val.value);
      }
      
      // General object fallback: stringify to inspect
      return JSON.stringify(val);
    }
    
    return String(val);
  } catch (err) {
    console.error('Error in getCellText:', err);
    return '';
  }
}

/**
 * Update cell display value securely
 */
export function setCellText(cell: any, newText: string) {
  try {
    if (!cell) return;
    const val = cell.value;
    
    if (val === null || val === undefined) {
      cell.value = newText;
      return;
    }
    
    if (typeof val === 'string') {
      cell.value = newText;
    } else if (typeof val === 'object') {
      if (val instanceof Date) {
        cell.value = newText;
        return;
      }
      
      if (val.result !== undefined) {
        cell.value = { ...val, result: newText };
      } else if (val.richText) {
        cell.value = newText; // Simplify rich text to a standard string
      } else if (val.text && val.hyperlink) {
        cell.value = { ...val, text: newText };
      } else if (val.value !== undefined) {
        cell.value = { ...val, value: newText };
      } else {
        cell.value = newText;
      }
    } else {
      cell.value = newText;
    }
  } catch (err) {
    console.error('Error in setCellText:', err);
  }
}
