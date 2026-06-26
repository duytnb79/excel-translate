import ExcelJS from 'exceljs';
import path from 'path';

async function testClone() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), 'sample-data.xlsx'));
  const originalSheet = wb.getWorksheet(1);
  
  console.log('Original Sheet cell (5, 2):', originalSheet.getCell(5, 2).value); // B5 (Tên sản phẩm 1)
  console.log('Original Sheet cell (5, 5):', originalSheet.getCell(5, 5).value); // E5 (Doanh thu 1)

  // Clone workbook via buffer
  const buffer = await wb.xlsx.writeBuffer();
  const clonedWb = new ExcelJS.Workbook();
  await clonedWb.xlsx.load(buffer);
  
  const clonedSheet = clonedWb.getWorksheet(1);
  console.log('\nCloned Sheet cell (5, 2):', clonedSheet.getCell(5, 2).value);
  console.log('Cloned Sheet cell (5, 5):', clonedSheet.getCell(5, 5).value);
}

testClone().catch(console.error);
