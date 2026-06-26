import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { 
  FileSpreadsheet, 
  Globe, 
  Menu, 
  X, 
  FileDown, 
  Loader
} from 'lucide-react';

// Shared Components
import { Toast } from '../shared/components/Toast';
import { ThemeToggle } from '../shared/components/ThemeToggle';

// Feature: Sheet Viewer
import { SheetViewer } from '../features/sheet-viewer/components/SheetViewer';
import { SheetSelector } from '../features/sheet-viewer/components/SheetSelector';
import { getCellText, setCellText, needsTranslation } from '../features/sheet-viewer/utils/excelParser';

// Feature: Translator
import { FileUpload } from '../features/translator/components/FileUpload';
import { TranslationSettings } from '../features/translator/components/TranslationSettings';
import { translateTexts, TranslationMode, TranslationProgress } from '../features/translator/utils/translator';

// Providers
import { useTheme } from './providers/ThemeProvider';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // File States
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string>('');
  
  // Workbook data
  const [origWorkbook, setOrigWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [transWorkbook, setTransWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  
  // Translation Config States
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('vi');
  const [translationMode, setTranslationMode] = useState<TranslationMode>('google');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showGridlines, setShowGridlines] = useState<boolean>(true);
  
  // UI Layout States
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'original' | 'translated'>('original');
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Toast trigger helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Convert bytes to human readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Process selected spreadsheet file
  const handleFileSelect = async (selectedFile: File) => {
    setLoading(true);
    setProgress(null);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);

      if (wb.worksheets.length === 0) {
        throw new Error('Tệp excel không chứa worksheet nào.');
      }

      setOrigWorkbook(wb);
      setTransWorkbook(null);
      setSheetNames(wb.worksheets.map(s => s.name));
      setActiveSheetIndex(0);
      setActiveTab('original');
      setFile(selectedFile);
      setFileSizeStr(formatBytes(selectedFile.size));
      showToast('Đã tải tệp bảng tính thành công!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi khi đọc tệp Excel. Hãy kiểm tra định dạng.', 'error');
      setFile(null);
      setOrigWorkbook(null);
    } finally {
      setLoading(false);
    }
  };

  // Clear current spreadsheet
  const handleClearFile = () => {
    setFile(null);
    setOrigWorkbook(null);
    setTransWorkbook(null);
    setSheetNames([]);
  };

  // Run cell translation
  const handleTranslate = async () => {
    if (!origWorkbook || !file) return;

    if (translationMode === 'gemini' && !geminiApiKey.trim()) {
      showToast('Vui lòng điền Gemini API Key để dịch bằng AI.', 'error');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: 100, percentage: 0 });

    try {
      // 1. Double buffer clone (buffer write/read) to preserve formatting details
      const originalBuffer = await origWorkbook.xlsx.writeBuffer();
      const clonedWb = new ExcelJS.Workbook();
      await clonedWb.xlsx.load(originalBuffer);

      // 2. Fetch cell unique text collections
      const textsToTranslate: string[] = [];
      clonedWb.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            const txt = getCellText(cell);
            if (needsTranslation(txt)) {
              textsToTranslate.push(txt);
            }
          });
        });
      });

      if (textsToTranslate.length === 0) {
        setTransWorkbook(clonedWb);
        setActiveTab('translated');
        showToast('Bảng tính không chứa nội dung chữ cần dịch.');
        setLoading(false);
        return;
      }

      // 3. Execute translation engine
      const translationMap = await translateTexts(
        textsToTranslate,
        sourceLang,
        targetLang,
        translationMode,
        geminiApiKey,
        (progressInfo) => {
          setProgress(progressInfo);
        }
      );

      // Save Gemini API key securely if successful
      if (translationMode === 'gemini') {
        localStorage.setItem('gemini_api_key', geminiApiKey);
      }

      // 4. Overwrite text values in clone workbook
      clonedWb.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            const txt = getCellText(cell);
            if (translationMap.has(txt)) {
              const translatedVal = translationMap.get(txt);
              if (translatedVal) {
                setCellText(cell, translatedVal);
              }
            }
          });
        });
      });

      setTransWorkbook(clonedWb);
      setActiveTab('translated');
      showToast('Dịch bảng tính thành công!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Có lỗi xảy ra trong quá trình dịch.', 'error');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // Download translated file
  const handleDownload = async () => {
    if (!transWorkbook || !file) return;

    try {
      const buffer = await transWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      const dotIndex = file.name.lastIndexOf('.');
      const name = dotIndex > -1 ? file.name.slice(0, dotIndex) : file.name;
      const ext = dotIndex > -1 ? file.name.slice(dotIndex) : '.xlsx';
      
      a.href = url;
      a.download = `${name}_translated_${targetLang}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Đã tải xuống bảng dịch thành công!');
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi chuẩn bị tệp tải xuống.', 'error');
    }
  };

  // Resolve current active sheet to view
  const activeWorksheet = useMemo(() => {
    const wb = activeTab === 'original' ? origWorkbook : transWorkbook;
    if (!wb) return null;
    return wb.getWorksheet(activeSheetIndex + 1);
  }, [activeTab, origWorkbook, transWorkbook, activeSheetIndex]);

  return (
    <div className="app-container">
      
      {/* Shared Toast Alert */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          {progress ? (
            <>
              <Loader size={36} className="spinner" />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Đang dịch bảng tính...</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Đã dịch {progress.current}/{progress.total} cụm từ
                </p>
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress.percentage}%` }}></div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{progress.percentage}%</p>
            </>
          ) : (
            <>
              <Loader size={36} className="spinner" />
              <p style={{ fontWeight: 500 }}>Đang xử lý tệp...</p>
            </>
          )}
        </div>
      )}

      {/* Sidebar Control Panel */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Globe size={18} />
            <span>Sheets Translate</span>
          </div>
          <button 
            type="button"
            className="btn-icon" 
            title="Thu gọn menu" 
            onClick={() => setSidebarCollapsed(true)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="sidebar-content">
          {/* File Upload Zone */}
          <FileUpload 
            file={file}
            fileSizeStr={fileSizeStr}
            onFileSelect={handleFileSelect}
            onClear={handleClearFile}
          />

          {/* Translation Settings Form */}
          <TranslationSettings 
            sourceLang={sourceLang}
            setSourceLang={setSourceLang}
            targetLang={targetLang}
            setTargetLang={setTargetLang}
            translationMode={translationMode}
            setTranslationMode={setTranslationMode}
            geminiApiKey={geminiApiKey}
            setGeminiApiKey={setGeminiApiKey}
            showGridlines={showGridlines}
            setShowGridlines={setShowGridlines}
            onTranslate={handleTranslate}
            disabled={!origWorkbook || loading}
          />
        </div>
      </aside>

      {/* Main Grid Viewport */}
      <main className="main-panel">
        
        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            {sidebarCollapsed && (
              <button 
                type="button"
                className="btn-icon" 
                title="Mở menu" 
                onClick={() => setSidebarCollapsed(false)}
              >
                <Menu size={16} />
              </button>
            )}
            
            {/* Before/After Tabs */}
            {origWorkbook && (
              <div className="tabs-container">
                <button 
                  type="button"
                  className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
                  onClick={() => setActiveTab('original')}
                >
                  Trước khi dịch
                </button>
                <button 
                  type="button"
                  className={`tab-btn ${activeTab === 'translated' ? 'active' : ''}`}
                  disabled={!transWorkbook}
                  onClick={() => setActiveTab('translated')}
                  title={!transWorkbook ? 'Vui lòng nhấn "Dịch Ngay" trước' : ''}
                >
                  Sau khi dịch
                </button>
              </div>
            )}
          </div>

          <div className="top-bar-right">
            {/* Download Button */}
            {transWorkbook && activeTab === 'translated' && (
              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }}
                onClick={handleDownload}
              >
                <FileDown size={14} />
                Tải Bảng Dịch
              </button>
            )}

            {/* Light/Dark Toggle */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        {/* Excel Spreadsheet render viewport */}
        {activeWorksheet ? (
          <SheetViewer 
            worksheet={activeWorksheet}
            showGridlines={showGridlines}
          />
        ) : (
          <div className="sheet-empty-state" style={{ flex: 1 }}>
            <FileSpreadsheet size={48} strokeWidth={1.5} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>Chưa tải bảng tính</h2>
            <p style={{ maxWidth: '280px', fontSize: '12px' }}>
              Hãy kéo thả hoặc tải lên một tệp Excel để dịch và duyệt dữ liệu.
            </p>
          </div>
        )}

        {/* Worksheet selector tabs */}
        <SheetSelector 
          sheetNames={sheetNames}
          activeIndex={activeSheetIndex}
          onSelect={setActiveSheetIndex}
        />
      </main>

    </div>
  );
};
