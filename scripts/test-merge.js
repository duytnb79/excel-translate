import ExcelJS from 'exceljs';
import path from 'path';

async function testMerge() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Test');

  // Merge A1:C2
  sheet.mergeCells('A1:C2');
  sheet.getCell('A1').value = 'Merged Title';

  console.log('--- Before Save ---');
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 3; c++) {
      const cell = sheet.getCell(r, c);
      console.log(`Cell ${cell.address}: value = "${cell.value}", isMerged = ${cell.isMerged}, master = ${cell.master.address}`);
    }
  }

  // Save and reload
  const outPath = path.join(process.cwd(), 'temp-merge.xlsx');
  await workbook.xlsx.writeFile(outPath);

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(outPath);
  const sheet2 = wb2.getWorksheet(1);

  console.log('\n--- After Load ---');
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 3; c++) {
      const cell = sheet2.getCell(r, c);
      console.log(`Cell ${cell.address}: value = "${cell.value}", isMerged = ${cell.isMerged}, master = ${cell.master ? cell.master.address : 'undefined'}`);
    }
  }
}

testMerge().catch(console.error);
