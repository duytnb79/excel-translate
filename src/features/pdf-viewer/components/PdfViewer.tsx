import React, { useEffect, useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfDocumentData, PdfPageData } from '../utils/pdfParser';

export interface PdfViewerProps {
  pdfBuffer: ArrayBuffer;
  pdfData: PdfDocumentData | null;
  activeTab: 'original' | 'translated';
  translationMap: Map<string, string> | null;
  zoomLevel: number;
  onZoomChange?: (zoom: number) => void;
  onColorsDetected?: (colors: Map<string, { bg: string; text: string }>) => void;
  currentPageIndex?: number;
  onPageChange?: (page: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfBuffer,
  pdfData,
  activeTab,
  translationMap,
  zoomLevel,
  onZoomChange,
  onColorsDetected,
  currentPageIndex,
  onPageChange,
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [localPageIndex, setLocalPageIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePageIndex = currentPageIndex !== undefined ? currentPageIndex : localPageIndex;

  // Load PDFJS Document instance
  useEffect(() => {
    let active = true;
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const bufferCopy = pdfBuffer.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: bufferCopy });
        const doc = await loadingTask.promise;
        if (active) {
          setPdfDoc(doc);
        }
      } catch (err: any) {
        console.error('Error loading PDF in viewer:', err);
        if (active) {
          setError(err.message || 'Không thể tải tài liệu PDF.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => {
      active = false;
    };
  }, [pdfBuffer]);

  // Reset page index on document change (only if uncontrolled)
  useEffect(() => {
    if (currentPageIndex === undefined) {
      setLocalPageIndex(0);
    }
  }, [pdfBuffer, currentPageIndex]);

  // Implement Trackpad Pinch-to-zoom & Ctrl+Scroll zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onZoomChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Stop default browser zoom
        
        const zoomFactor = 0.05;
        const direction = e.deltaY < 0 ? 1 : -1;
        const newZoom = Math.min(Math.max(0.5, zoomLevel + direction * zoomFactor), 3.0);
        onZoomChange(parseFloat(newZoom.toFixed(2)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, onZoomChange]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Đang nạp bộ xem PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px', color: 'var(--error)' }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!pdfData) {
    return null;
  }

  const totalPages = pdfData.totalPages;
  const currentPageData = pdfData.pages[activePageIndex];

  const handlePrevPage = () => {
    const nextVal = Math.max(0, activePageIndex - 1);
    if (onPageChange) onPageChange(nextVal);
    else setLocalPageIndex(nextVal);
    
    // Scroll container back to top when switching pages
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  const handleNextPage = () => {
    const nextVal = Math.min(totalPages - 1, activePageIndex + 1);
    if (onPageChange) onPageChange(nextVal);
    else setLocalPageIndex(nextVal);

    // Scroll container back to top when switching pages
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  return (
    <div 
      className="pdf-viewer-container"
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        padding: '24px',
        backgroundColor: 'var(--bg-secondary, #f3f4f6)',
        height: 'calc(100vh - 110px)',
        overflow: 'auto',
        boxSizing: 'border-box',
        width: '100%',
        position: 'relative'
      }}
    >
      {currentPageData && (
        <PdfPage
          key={currentPageData.pageIndex}
          pdfDoc={pdfDoc}
          pageData={currentPageData}
          activeTab={activeTab}
          translationMap={translationMap}
          zoomLevel={zoomLevel}
          onColorsDetected={onColorsDetected}
        />
      )}

      {/* Floating Hover Navigation & Zoom Controls */}
      <div
        className="pdf-floating-toolbar"
        style={{
          position: 'sticky',
          bottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          borderRadius: '20px',
          opacity: isHovered ? 1 : 0.5,
          transition: 'opacity 0.2s ease',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          pointerEvents: 'auto'
        }}
      >
        {/* Prev Page Button */}
        <button
          type="button"
          onClick={handlePrevPage}
          disabled={activePageIndex === 0}
          style={{
            background: 'transparent',
            border: 'none',
            color: activePageIndex === 0 ? 'rgba(255, 255, 255, 0.3)' : 'white',
            cursor: activePageIndex === 0 ? 'default' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'background 0.2s'
          }}
          title="Trang trước"
        >
          &lsaquo;
        </button>

        {/* Page Indicator */}
        <span style={{ fontSize: '13px', fontWeight: 500, minWidth: '95px', textAlign: 'center' }}>
          Trang {activePageIndex + 1} / {totalPages}
        </span>

        {/* Next Page Button */}
        <button
          type="button"
          onClick={handleNextPage}
          disabled={activePageIndex === totalPages - 1}
          style={{
            background: 'transparent',
            border: 'none',
            color: activePageIndex === totalPages - 1 ? 'rgba(255, 255, 255, 0.3)' : 'white',
            cursor: activePageIndex === totalPages - 1 ? 'default' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'background 0.2s'
          }}
          title="Trang sau"
        >
          &rsaquo;
        </button>

        {/* Divider */}
        {onZoomChange && <div style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255, 255, 255, 0.2)', margin: '0 8px' }} />}

        {/* Zoom Out Button */}
        {onZoomChange && (
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.5, parseFloat((zoomLevel - 0.1).toFixed(2))))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s'
            }}
            title="Thu nhỏ"
          >
            -
          </button>
        )}

        {/* Zoom Level text */}
        {onZoomChange && (
          <span style={{ fontSize: '13px', fontWeight: 500, minWidth: '45px', textAlign: 'center' }}>
            {Math.round(zoomLevel * 100)}%
          </span>
        )}

        {/* Zoom In Button */}
        {onZoomChange && (
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(3.0, parseFloat((zoomLevel + 0.1).toFixed(2))))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s'
            }}
            title="Phóng to"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
};

interface PdfPageProps {
  pdfDoc: any;
  pageData: PdfPageData;
  activeTab: 'original' | 'translated';
  translationMap: Map<string, string> | null;
  zoomLevel: number;
  onColorsDetected?: (colors: Map<string, { bg: string; text: string }>) => void;
}

const PdfPage: React.FC<PdfPageProps> = ({
  pdfDoc,
  pageData,
  activeTab,
  translationMap,
  zoomLevel,
  onColorsDetected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [pageColors, setPageColors] = useState<Map<number, { bg: string; text: string }>>(new Map());

  useEffect(() => {
    let active = true;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !pdfDoc) return;

      // Cancel previous render if in progress and wait for it to cancel
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        try {
          await renderTaskRef.current.promise;
        } catch (e) {
          // Ignore cancellation rejection
        }
        renderTaskRef.current = null;
      }

      if (!active) return;

      try {
        const page = await pdfDoc.getPage(pageData.pageIndex + 1);
        if (!active) return;

        const viewport = page.getViewport({ scale: zoomLevel });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const canvasContext = canvas.getContext('2d')!;
        // Clear canvas
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
        if (active) {
          renderTaskRef.current = null;
          setRenderError(null);

          // Detect background and text colors dynamically from canvas pixels
          const colorsMap = new Map<number, { bg: string; text: string }>();
          const globalColors = new Map<string, { bg: string; text: string }>();

          pageData.items.forEach((item, idx) => {
            const safeW = getSafeMaxWidth(item);
            const detected = detectColors(
              canvas,
              item.x * zoomLevel,
              item.y * zoomLevel,
              safeW * zoomLevel,
              item.height * zoomLevel
            );
            colorsMap.set(idx, detected);
            globalColors.set(item.originalStr, detected);
          });

          setPageColors(colorsMap);
          if (onColorsDetected) {
            onColorsDetected(globalColors);
          }
        }
      } catch (err: any) {
        if (active && err.name !== 'RenderingCancelledException' && err.message !== 'Rendering cancelled, closed or canvas size changed') {
          console.error(`Error rendering page ${pageData.pageIndex + 1}:`, err);
          setRenderError('Lỗi render trang.');
        }
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageData, zoomLevel]);

  const pageWidth = pageData.width * zoomLevel;
  const pageHeight = pageData.height * zoomLevel;

  return (
    <div 
      className="pdf-page-wrapper"
      style={{
        position: 'relative',
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
        backgroundColor: '#ffffff',
        borderRadius: '4px',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      {renderError ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', color: 'var(--error)' }}>
          <span>{renderError}</span>
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      )}

      {/* HTML Overlay Text Layer (Visible only when translated tab is active) */}
      {activeTab === 'translated' && translationMap && (
        <div 
          className="pdf-text-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none', // Allow canvas interactions or selection if needed
          }}
        >
          {pageData.items.map((item, idx) => {
            const translatedText = translationMap.get(item.originalStr) || item.str;
            
            // Calculate fitted font size to prevent text overlapping
            const baseFontSize = item.fontSize * zoomLevel;
            const maxWidth = item.width * zoomLevel;
            const fittedFontSize = getFitFontSize(translatedText, baseFontSize, maxWidth);

            // Fetch dynamically detected colors or fallback
            const colors = pageColors.get(idx) || { bg: '#ffffff', text: '#000000' };

            // Render absolute overlay blocks
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${item.x * zoomLevel}px`,
                  top: `${item.y * zoomLevel}px`,
                  fontSize: `${fittedFontSize}px`,
                  width: `${maxWidth}px`,
                  height: `${item.height * zoomLevel}px`,
                  backgroundColor: colors.bg, // Dynamic background
                  color: colors.text, // Dynamic text color
                  fontFamily: 'sans-serif',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.1,
                  transformOrigin: 'top left',
                  overflow: 'hidden', // Hide overflow to keep boxes clean
                  padding: '1px 2px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={item.originalStr} // Hover shows original text as tooltip
              >
                <span style={{ display: 'inline-block', width: '100%', whiteSpace: 'nowrap' }}>
                  {translatedText}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

let sharedCanvasContext: CanvasRenderingContext2D | null = null;
function getFitFontSize(text: string, baseFontSize: number, maxWidth: number): number {
  if (maxWidth <= 0 || !text) return baseFontSize;
  if (!sharedCanvasContext) {
    const canvas = document.createElement('canvas');
    sharedCanvasContext = canvas.getContext('2d');
  }
  if (!sharedCanvasContext) return baseFontSize;
  sharedCanvasContext.font = `${baseFontSize}px sans-serif`;
  const textWidth = sharedCanvasContext.measureText(text).width;
  if (textWidth > maxWidth) {
    return Math.max(6, baseFontSize * (maxWidth / textWidth));
  }
  return baseFontSize;
}

function detectColors(
  canvas: HTMLCanvasElement, 
  x: number, 
  y: number, 
  w: number, 
  h: number
): { bg: string; text: string } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { bg: '#ffffff', text: '#000000' };

  try {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const getPixelColor = (px: number, py: number): { r: number; g: number; b: number } => {
      const cx = Math.max(0, Math.min(canvasWidth - 1, Math.round(px)));
      const cy = Math.max(0, Math.min(canvasHeight - 1, Math.round(py)));
      const imgData = ctx.getImageData(cx, cy, 1, 1).data;
      return { r: imgData[0] ?? 0, g: imgData[1] ?? 0, b: imgData[2] ?? 0 };
    };

    // Sample background color outside text box corners
    const samples = [
      getPixelColor(x - 2, y - 2),
      getPixelColor(x + w + 2, y - 2),
      getPixelColor(x - 2, y + h + 2),
      getPixelColor(x + w + 2, y + h + 2)
    ];

    let sumR = 0, sumG = 0, sumB = 0;
    samples.forEach(s => {
      sumR += s.r;
      sumG += s.g;
      sumB += s.b;
    });
    const avgR = Math.round(sumR / samples.length);
    const avgG = Math.round(sumG / samples.length);
    const avgB = Math.round(sumB / samples.length);

    const bgHex = rgbToHex(avgR, avgG, avgB);

    // Scan column by column from left to right (within a reasonable width, e.g. up to 80px or w)
    // to find the first pixel that differs significantly from the background.
    const scanLimit = Math.min(w, 80);
    let maxDist = -1;
    let textR = 0, textG = 0, textB = 0;

    for (let dx = 2; dx < scanLimit; dx += 4) {
      for (let dy = 2; dy < h; dy += 3) {
        const c = getPixelColor(x + dx, y + dy);
        const dist = Math.sqrt(
          Math.pow(c.r - avgR, 2) + 
          Math.pow(c.g - avgG, 2) + 
          Math.pow(c.b - avgB, 2)
        );

        if (dist > maxDist) {
          maxDist = dist;
          textR = c.r;
          textG = c.g;
          textB = c.b;
        }
      }
      // If we found a very strong text pixel (dist > 80), break early
      if (maxDist > 80) {
        break;
      }
    }

    const brightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;
    let textHex = rgbToHex(textR, textG, textB);
    
    if (maxDist < 30) {
      textHex = brightness > 128 ? '#000000' : '#ffffff';
    }

    return { bg: bgHex, text: textHex };
  } catch (e) {
    console.error('Error detecting pixel colors:', e);
    return { bg: '#ffffff', text: '#000000' };
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, val));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function getSafeMaxWidth(item: { str: string; fontSize: number; width: number }): number {
  const originalStr = item.str || '';
  const fontSize = item.fontSize || 12;
  const parsedWidth = item.width || 0;

  let expectedWidth = 0;
  for (let i = 0; i < originalStr.length; i++) {
    const code = originalStr.charCodeAt(i);
    if (code >= 0x3000 && code <= 0x9fff) {
      expectedWidth += fontSize * 0.9;
    } else {
      expectedWidth += fontSize * 0.52;
    }
  }

  if (parsedWidth < expectedWidth * 0.5) {
    return expectedWidth;
  }
  return parsedWidth;
}
