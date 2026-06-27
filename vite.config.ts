import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { IncomingMessage, ServerResponse } from 'http';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'google-sheets-proxy',
      configureServer(server) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
          const urlObj = new URL(req.url || '', 'http://localhost');
          if (urlObj.pathname === '/api/proxy-sheet') {
            const sheetUrl = urlObj.searchParams.get('url');
            if (!sheetUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing url parameter' }));
              return;
            }

            try {
              const parsedUrl = new URL(sheetUrl);
              if (!parsedUrl.hostname.endsWith('google.com')) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Only Google Sheets URLs are supported' }));
                return;
              }

              // Parse Google Sheets ID and convert to export URL
              let exportUrl = sheetUrl;
              const matches = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
              if (matches && matches[1]) {
                const sheetId = matches[1];
                exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
              } else {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid Google Sheets URL format' }));
                return;
              }

              // Fetch the excel file
              const response = await fetch(exportUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch sheet: ${response.statusText}`);
              }

              const buffer = await response.arrayBuffer();
              
              // Set headers
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              res.setHeader('Content-Disposition', 'attachment; filename="sheet.xlsx"');
              res.end(Buffer.from(buffer));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    allowedHosts: ["broderick-unflaked-unhastily.ngrok-free.dev"],
    port: 3000,
    open: true,
  },
});
