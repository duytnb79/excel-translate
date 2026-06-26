import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

async function createSampleExcel() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo Doanh thu');

  // Set grid lines visible
  sheet.views = [{ showGridLines: true }];

  // Column Widths
  sheet.getColumn(1).width = 5;   // Index
  sheet.getColumn(2).width = 25;  // Product Name
  sheet.getColumn(3).width = 15;  // Price
  sheet.getColumn(4).width = 10;  // Quantity
  sheet.getColumn(5).width = 18;  // Total Revenue

  // Title Block (Merged A1:E2)
  sheet.mergeCells('A1:E2');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'BÁO CÁO DOANH THU CỬA HÀNG 2026';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F51B5' } }; // Indigo

  // Headers (Row 4)
  const headerRow = sheet.getRow(4);
  headerRow.height = 28;
  const headers = ['STT', 'Tên sản phẩm', 'Đơn giá (VND)', 'Số lượng', 'Doanh thu (VND)'];
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark slate
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } }
    };
  });

  // Data Rows
  const items = [
    { name: 'Điện thoại thông minh X1', price: 15000000, qty: 12 },
    { name: 'Máy tính xách tay Pro 15', price: 32000000, qty: 5 },
    { name: 'Tai nghe chống ồn không dây', price: 4500000, qty: 20 },
    { name: 'Máy tính bảng Tab Lite', price: 8000000, qty: 8 },
    { name: 'Đồng hồ thông minh Fit', price: 3500000, qty: 15 }
  ];

  items.forEach((item, index) => {
    const rIndex = 5 + index;
    const row = sheet.getRow(rIndex);
    row.height = 22;

    const values = [
      index + 1,
      item.name,
      item.price,
      item.qty,
      item.price * item.qty
    ];

    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (idx === 0) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (idx === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      
      // Zebra striping
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // Summary Row (Row 10)
  sheet.mergeCells('A10:D10');
  const sumLabel = sheet.getCell('A10');
  sumLabel.value = 'Tổng cộng doanh thu thực tế';
  sumLabel.font = { name: 'Arial', size: 10, bold: true };
  sumLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  sumLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumLabel.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'double', color: { argb: 'FF1E293B' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // Set borders for hidden cells in the merge so the borders look continuous
  ['B10', 'C10', 'D10'].forEach((cellAddr) => {
    sheet.getCell(cellAddr).border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'double', color: { argb: 'FF1E293B' } }
    };
    sheet.getCell(cellAddr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  const sumVal = sheet.getCell('E10');
  sumVal.value = items.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
  sumVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  sumVal.alignment = { horizontal: 'right', vertical: 'middle' };
  sumVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sumVal.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'double', color: { argb: 'FF1E293B' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // Add an image (A 100x100 logo represented by base64)
  // This is a base64 PNG of a blue icon with a globe shape
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AYbDhYZi5y1eAAABbRJREFUeNrtm21sU2UUx3/3trd1YyNsy9iYw2BkgGwoKiFicYgSjT+IJgTUiD/8QExMTPxCDD/4hS/+IEZNDBqNRo0aQ4yJCf7gB0gEBQMZIgNkBmVsY+vG2trerx9uK+vG293W29t1yT/pTbt7zz3nnt997zn33OfchYKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKC/h+mG0jO5/v3e226W59L38V12tbrLp6nL/L1Hq7TtqV67+cGrvN38Hn6C3yVvkzfQz/CP02y/xHn6D/pZ/m/a1tT3bbr7qP0Kfpn+o9x9Bf4U9Vv4jH6V/qP+1Ldtunuov/B/zS/F/4v8Z/l6x76G/x5/g4+Tx/h8/T3+Lv5PH2E/jZ/h/pdPEb/Rv/7p/f0+u3Qf4z+Fp+nH+K5gUoBqACoB7YBW4Bt1b5XgZ0AVQADXAO8x7Wj56j3fB/1Nf+3A9Xq16rfwGMBPAt8CHwEvAO8BXwAvA28BbwJvAG8DrwOvFrtp3k9A7wIvKAf7i76B+j5a+jXq/+5+tfXUPdVD0oDSgOqB6X5v75H7+5G3UN/D/3H6C9X/90a6o4a7u+h/12m8/0r2Teq2b8aOAjcD+wBdgP7tH3UvXU/0O/hOnv9O/g8/d1gT59P/0/o16pZv+q2E3+g/mZ/N58XeYt3+Tv5PH2Ez9Pf8df4gX4Pn9fL8/QRPq+X5+kdfB6e5+vU3eH+Hvp3+nv4vMi2G+yN+hv93Xy+yPP09/B5+nt4Luo9PJeve+jvof/df+8/vefD0H8P/V9/w/+XWJp9M5q+29tG33O1jS2r/U0a6y6NcZfGKGN+qca3q/E9anwfjd/X+P3G+M4a44x/y23Vfsr/l6r219fQx9dTx9fx9cTxdR6P/uC/55++d62K/4dY8tX4Upo2v7f4N3PjN6rxA2r8Q41vVuMH/9R3+kCN/3jHh1X7Gv8nUe2lqhb7GupGqob6Gmqx/7/GjGg/3fH/tOqX3Vn9krtV+9L1q6v/VvVfV/+a3+F/g+X6Nfyruemr6eHftdG3qPGrNH5Ajd+txj8t1G4aX/bX1PhC/55/Kq/15W8s9b5L/Yp/tfr5Gup4fXU8vlqeP8vzl93T91P3/T891e+2X/d3Wn++2d1x/b00vdX/q/q1/qOqXfeW/HXT/pD/KxP0P8vj5fHz/Fl+r/L4eXx91f+XyGv9f1tKvee2hLojX8uLPC73aMlxuaefE/bI1/L4Wf5bHj/LH/n/t8ZqfdfmUvfM58n3yNeq+/v4enp8j/yR75G/Wc1v+v2U7/k+uS3h3qrv2ly670nfe0TfW0T/NvrWk+47xN+S7nfk7vD/a8r//b111+z1PecW99wL9lzUXe7N+XNO95B7h70Z3lOqPeo55LnoDux/yP3dnlPqPeXeXO/Z3vP0nuW9xW5x9zNf9F7sLfZu9pZ6i73b7C2j/FvVz9fQx+ur4/HV8vxZnr/snnvCvaXu5+4n+p/dE5/d4/t9ur/D+rMsfdvT+t2e1u/2tL5bTev2/9N63Z7Wq6e1279tZ3333333333333333333333333333333333/fWf1/wLwF8AfAP+1+A/hD4C/2P+Z6D+CPwD+QPi/iP8X+i/iP2P/X6b/B/oD4D+D/wL+C/jPA/+Z6A/0B8B/AP+e6B9E/yD694n+QfTvqf5/f/NfC/+V8F8J/xT/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/xL/Ev8S/wT/v/APvjD9c/V99pAAAAAElFTkSuQmCC';
  const imgBuffer = Buffer.from(base64Image, 'base64');
  
  const imageId = workbook.addImage({
    buffer: imgBuffer,
    extension: 'png',
  });

  // Put image overlaying A12:B15
  sheet.addImage(imageId, {
    tl: { col: 1, row: 11 }, // B12
    br: { col: 3, row: 15 }, // D16
    editAs: 'absolute'
  });

  const outPath = path.join(process.cwd(), 'sample-data.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`Sample Excel file created successfully at ${outPath}`);
}

createSampleExcel().catch(console.error);
