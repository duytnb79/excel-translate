import React from 'react';
import { Maximize2, RefreshCw, PanelLeftOpen, ZoomIn, ZoomOut } from 'lucide-react';

export interface SheetToolbarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  hasWorkbook: boolean;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  isAllAutoFitted: boolean;
  onToggleAutoFitAll: () => void;
  fontSizeOffset: number;
  onFontSizeOffsetChange: (offset: number | ((prev: number) => number)) => void;
}

export const SheetToolbar: React.FC<SheetToolbarProps> = ({
  sidebarCollapsed,
  setSidebarCollapsed,
  hasWorkbook,
  zoomLevel,
  onZoomChange,
  isAllAutoFitted,
  onToggleAutoFitAll,
  fontSizeOffset,
  onFontSizeOffsetChange
}) => {
  return (
    <div className="top-bar-left">
      {sidebarCollapsed && (
        <button 
          type="button"
          className="toolbar-btn" 
          title="Mở menu" 
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
      
      {sidebarCollapsed && hasWorkbook && <div className="toolbar-divider" />}
      
      {hasWorkbook && (
        <>
          {/* Zoom Control Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: 'var(--bg-hover)', borderRadius: '4px', padding: '1px 3px' }}>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => onZoomChange(Math.max(0.5, parseFloat((zoomLevel - 0.1).toFixed(2))))}
              title="Thu nhỏ (-10%)"
              style={{ width: '24px', height: '24px', padding: 0 }}
            >
              <ZoomOut size={14} />
            </button>
            
            <select 
              className="zoom-select" 
              value={zoomLevel}
              onChange={(e) => onZoomChange(parseFloat(e.target.value))}
              title="Tỷ lệ thu phóng"
              style={{ paddingRight: '16px', backgroundPosition: 'right 2px center' }}
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="0.9">90%</option>
              <option value="1">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
              {![0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0].includes(zoomLevel) && (
                <option value={zoomLevel}>{Math.round(zoomLevel * 100)}%</option>
              )}
            </select>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => onZoomChange(Math.min(2.0, parseFloat((zoomLevel + 0.1).toFixed(2))))}
              title="Phóng to (+10%)"
              style={{ width: '24px', height: '24px', padding: 0 }}
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Auto-fit All / Reset Button */}
          <button
            type="button"
            className="toolbar-btn"
            onClick={onToggleAutoFitAll}
            title={isAllAutoFitted ? "Đặt lại kích thước tất cả cột & hàng" : "Tự động căn chỉnh vừa vặn tất cả cột & hàng"}
          >
            {isAllAutoFitted ? (
              <>
                <RefreshCw size={13} />
                <span>Đặt lại kích thước</span>
              </>
            ) : (
              <>
                <Maximize2 size={13} />
                <span>Căn vừa ô</span>
              </>
            )}
          </button>

          <div className="toolbar-divider" />

          {/* Font Size Adjust Group */}
          <div className="font-size-group">
            <button
              type="button"
              className="font-size-btn"
              onClick={() => onFontSizeOffsetChange((prev: number) => Math.max(-4, prev - 1))}
              title="Giảm cỡ chữ của tất cả các ô (-1px)"
            >
              -
            </button>
            <div className="font-size-box">
              {12 + fontSizeOffset}
            </div>
            <button
              type="button"
              className="font-size-btn"
              onClick={() => onFontSizeOffsetChange((prev: number) => Math.min(8, prev + 1))}
              title="Tăng cỡ chữ của tất cả các ô (+1px)"
            >
              +
            </button>
          </div>
        </>
      )}
    </div>
  );
};


