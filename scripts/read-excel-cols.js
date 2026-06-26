import ExcelJS from 'exceljs';
import path from 'path';

async function checkCols() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), 'sample-data.xlsx'));
  const sheet = wb.getWorksheet(1);
  
  console.log('Worksheet name:', sheet.name);
  console.log('maxCol from bounds logic:', sheet.columnCount);
  
  for (let c = 1; c <= 8; c++) {
    const col = sheet.getColumn(c);
    console.log(`Col ${c} (Letter ${sheet.getColumn(c).key || c}): width = ${col.width}`);
  }
}

checkCols().catch(console.error);
