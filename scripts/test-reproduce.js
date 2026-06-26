import ExcelJS from 'exceljs';
import path from 'path';

async function testReproduce() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  
  // Set grid lines visible
  sheet.views = [{ showGridLines: true }];

  // Column widths mimicking the original
  sheet.getColumn(1).width = 2;   // A
  sheet.getColumn(2).width = 5;   // B (No)
  sheet.getColumn(3).width = 5;   // C (Sub)
  sheet.getColumn(4).width = 5;   // D
  sheet.getColumn(5).width = 5;   // E
  sheet.getColumn(6).width = 5;   // F
  sheet.getColumn(7).width = 50;  // G (Detail - wide!)
  sheet.getColumn(8).width = 10;  // H (Effort)
  sheet.getColumn(9).width = 10;  // I
  sheet.getColumn(10).width = 12; // J (Start Date)

  // Merge ranges:
  sheet.mergeCells('B2:F2');
  sheet.getCell('B2').value = 'Yêu cầu chi tiết';

  sheet.mergeCells('B3:J3');
  sheet.getCell('B3').value = 'Cho phép bạn tự do thiết lập phân phối...';

  sheet.mergeCells('B5:F5');
  sheet.getCell('B5').value = 'Danh sách việc cần làm';

  // Row 6 headers (No merge)
  sheet.getCell('B6').value = 'Khống';
  sheet.getCell('C6').value = 'phu';
  sheet.getCell('G6').value = 'Detail';

  // Row 8 (Section Header)
  sheet.getCell('B8').value = '1';
  sheet.mergeCells('C8:F8');
  sheet.getCell('C8').value = 'Sắp xếp yêu cầu';
  sheet.getCell('H8').value = '2';

  // Row 9 (Standard Task)
  sheet.getCell('B9').value = '1.1';
  sheet.getCell('C9').value = 'Xác nhận thông số...';
  sheet.getCell('G9').value = 'Thông số kỹ thuật...';

  // Find bounds
  let maxRow = 1;
  let maxCol = 1;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > maxRow) maxRow = rowNumber;
    row.eachCell((_cell, colNumber) => {
      if (colNumber > maxCol) maxCol = colNumber;
    });
  });
  
  const bounds = {
    maxRow: maxRow,
    maxCol: maxCol
  };

  console.log(`Bounds: maxRow = ${bounds.maxRow}, maxCol = ${bounds.maxCol}`);

  // Simulate rendering rows 2, 3, 5, 6, 8, 9
  const rowsToSimulate = [2, 3, 5, 6, 8, 9];
  
  rowsToSimulate.forEach((r) => {
    console.log(`\nRow ${r}:`);
    const rendered = [];
    for (let c = 1; c <= bounds.maxCol; c++) {
      const cell = sheet.getCell(r, c);
      
      // Merged check
      if (cell.isMerged && cell.master.address !== cell.address) {
        // Skip
        continue;
      }
      
      let colSpan = 1;
      if (cell.isMerged && cell.master.address === cell.address) {
        let nextC = c + 1;
        while (nextC <= bounds.maxCol) {
          const nextCell = sheet.getCell(r, nextC);
          if (nextCell.isMerged && nextCell.master.address === cell.address) {
            colSpan++;
            nextC++;
          } else {
            break;
          }
        }
      }
      
      rendered.push(`  Col ${c}: <td colSpan=${colSpan}>${cell.value}</td>`);
    }
    console.log(rendered.join('\n'));
  });
}

testReproduce().catch(console.error);
