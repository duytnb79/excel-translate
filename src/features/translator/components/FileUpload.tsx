import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

export interface FileUploadProps {
  file: File | null;
  fileSizeStr: string;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  onUrlImport?: (url: string) => Promise<void>;
  importLoading?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  file,
  fileSizeStr,
  onFileSelect,
  onClear,
  onUrlImport,
  importLoading = false,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState('');
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

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !onUrlImport) return;
    try {
      await onUrlImport(url);
      setUrl('');
    } catch (err) {
      console.error('URL import error:', err);
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
            type="button"
            className="btn-icon" 
            title="Thay đổi tệp"
            onClick={onClear}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
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
                Hỗ trợ .xlsx, .csv, .pdf
              </p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleInputChange} 
              accept=".xlsx, .csv, .pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/pdf"
              style={{ display: 'none' }}
            />
          </div>

          {onUrlImport && (
            <form onSubmit={handleUrlSubmit} className="url-import-form" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Hoặc dán link Google Sheets..."
                disabled={importLoading}
                className="url-import-input"
              />
              <button
                type="submit"
                disabled={importLoading || !url.trim()}
                className="btn btn-primary url-import-btn"
              >
                {importLoading ? 'Tải...' : 'Tải'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
};
