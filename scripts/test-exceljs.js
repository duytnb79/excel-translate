import ExcelJS from 'exceljs';

async function test() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Test');
  
  // Set value in B2 (Column 2) and leave Column 1 (A) empty
  sheet.getCell('B2').value = 'Hello B2';
  sheet.getCell('D2').value = 'Hello D2'; // Leave C2 empty

  console.log('Worksheet columns count:', sheet.columnCount);
  console.log('Worksheet rowCount:', sheet.rowCount);

  // Check row 2 values
  const row2 = sheet.getRow(2);
  console.log('Row 2 cell values directly:');
  for (let c = 1; c <= 5; c++) {
    const cell = sheet.getCell(2, c);
    console.log(`Col ${c}: value = "${cell.value}", isMerged = ${cell.isMerged}, address = ${cell.address}`);
  }
}

test().catch(console.error);
