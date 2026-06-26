import ExcelJS from 'exceljs';
import path from 'path';

async function testEmptyA() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  
  // Set values only in B2 (Column 2) and C2 (Column 3)
  sheet.getCell('B2').value = 'B2 Value';
  sheet.getCell('C2').value = 'C2 Value';
  
  // Set Column 2 (B) width to 30, and Column 3 (C) to 50
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 50;

  const outPath = path.join(process.cwd(), 'empty-a.xlsx');
  await workbook.xlsx.writeFile(outPath);

  // Load workbook again
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(outPath);
  const sheet2 = wb2.getWorksheet(1);

  console.log('--- After Load ---');
  console.log('Worksheet columns count:', sheet2.columnCount);
  console.log('Cell A2 value:', sheet2.getCell(2, 1).value);
  console.log('Cell B2 value:', sheet2.getCell(2, 2).value);
  console.log('Cell C2 value:', sheet2.getCell(2, 3).value);
  
  console.log('Column 1 width:', sheet2.getColumn(1).width);
  console.log('Column 2 width:', sheet2.getColumn(2).width);
  console.log('Column 3 width:', sheet2.getColumn(3).width);
}

testEmptyA().catch(console.error);
