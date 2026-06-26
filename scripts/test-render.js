import ExcelJS from 'exceljs';
import path from 'path';

async function runSimulation() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');

  // Mimic spreadsheet structure:
  // Column A is narrow and empty
  sheet.getColumn(1).width = 2; // Column A
  sheet.getColumn(2).width = 5; // Column B (No)
  sheet.getColumn(3).width = 5; // Column C (Sub)
  sheet.getColumn(4).width = 5; // Column D
  sheet.getColumn(5).width = 5; // Column E
  sheet.getColumn(6).width = 5; // Column F
  sheet.getColumn(7).width = 50; // Column G (Detail - wide!)

  // Row 2: B2 has "要望内容："
  sheet.getCell('B2').value = 'Yêu cầu chi tiết';

  // Row 6: B6: "No", C6: "Sub", G6: "Detail"
  sheet.getCell('B6').value = 'No';
  sheet.getCell('C6').value = 'Sub';
  sheet.getCell('G6').value = 'Detail';

  // Bounding box calculation logic
  let maxRow = 1;
  let maxCol = 1;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > maxRow) maxRow = rowNumber;
    row.eachCell((_cell, colNumber) => {
      if (colNumber > maxCol) maxCol = colNumber;
    });
  });

  const bounds = {
    maxRow: maxRow + 2,
    maxCol: maxCol + 2
  };

  console.log(`Bounds: maxRow = ${bounds.maxRow}, maxCol = ${bounds.maxCol}`);

  // Simulate rendering Row 6
  const r = 6;
  console.log(`\nSimulating rendering Row ${r}:`);
  
  const cellsRendered = [];
  for (let c = 1; c <= bounds.maxCol; c++) {
    const cell = sheet.getCell(r, c);
    
    // Merged cell check
    if (cell.isMerged && cell.master.address !== cell.address) {
      cellsRendered.push(`Col ${c}: NULL (merged)`);
      continue;
    }

    const value = cell.value;
    cellsRendered.push(`Col ${c}: <td>${value}</td>`);
  }

  console.log(cellsRendered.join('\n'));
}

runSimulation().catch(console.error);
