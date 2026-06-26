import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

export interface FileUploadProps {
  file: File | null;
  fileSizeStr: string;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  file,
  fileSizeStr,
  onFileSelect,
  onClear,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="control-group">
      <span className="section-title">Tệp bảng tính</span>
      {file ? (
        <div className="file-info-box">
          <div className="file-info-text">
            <div className="file-info-name" title={file.name}>
              {file.name}
            </div>
            <div className="file-info-size">{fileSizeStr}</div>
          </div>
          <button 
            className="btn-icon" 
            title="Thay đổi tệp"
            onClick={onClear}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div 
          className={`upload-container ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={24} />
          <div>
            <p style={{ fontWeight: 500, fontSize: '12px' }}>Nhấp hoặc Kéo thả tệp</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
              Hỗ trợ .xlsx, .csv
            </p>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleInputChange} 
            accept=".xlsx, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  );
};
