import React from 'react';
import { Maximize2, RefreshCw, PanelLeftOpen } from 'lucide-react';

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
          {/* Zoom Selector */}
          <select 
            className="zoom-select" 
            value={zoomLevel}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            title="Tỷ lệ thu phóng"
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="0.9">90%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>

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


