import React from 'react';
import { PanelLeftOpen } from 'lucide-react';

export interface PdfToolbarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  sidebarCollapsed,
  setSidebarCollapsed,
  zoomLevel,
  onZoomChange,
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
      
      {sidebarCollapsed && <div className="toolbar-divider" />}
      
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
        <option value="3">300%</option>
      </select>
    </div>
  );
};
