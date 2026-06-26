import ExcelJS from 'exceljs';

async function run() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  
  sheet.mergeCells('B2:F2');
  sheet.getCell('B2').value = 'Hello';
  
  const cellA2 = sheet.getCell('A2');
  console.log('A2 isMerged:', cellA2.isMerged);
  console.log('A2 master:', cellA2.master ? cellA2.master.address : 'none');
  
  const cellB2 = sheet.getCell('B2');
  console.log('B2 isMerged:', cellB2.isMerged);
  console.log('B2 master:', cellB2.master ? cellB2.master.address : 'none');
}

run();
