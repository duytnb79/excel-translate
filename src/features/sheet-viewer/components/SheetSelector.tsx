import React from 'react';

export interface SheetSelectorProps {
  sheetNames: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export const SheetSelector: React.FC<SheetSelectorProps> = ({
  sheetNames,
  activeIndex,
  onSelect,
}) => {
  if (sheetNames.length <= 1) return null;

  return (
    <div className="sheet-tabs-bar">
      {sheetNames.map((name, index) => (
        <button
          key={index}
          className={`sheet-tab ${activeIndex === index ? 'active' : ''}`}
          onClick={() => onSelect(index)}
        >
          {name}
        </button>
      ))}
    </div>
  );
};
