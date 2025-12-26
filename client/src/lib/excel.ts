import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import { apiRequest, queryClient } from './queryClient';
import { insertEmployeeSchema } from '@shared/schema';

export function downloadTemplate() {
  // Create a new workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Employees');
  
  // Define columns
  worksheet.columns = [
    { header: '__INSTRUCTIONS__', key: 'instructions', width: 30 },
    { header: 'name', key: 'name', width: 20 },
    { header: 'email', key: 'email', width: 25 },
    { header: 'position', key: 'position', width: 30 },
    { header: 'phoneNumber', key: 'phoneNumber', width: 25 },
  ];
  
  // Add example data
  worksheet.addRow({
    instructions: 'Please follow these guidelines for each column:',
    name: 'Full Name (e.g., John Smith)',
    email: 'Email address (e.g., john.smith@company.com)',
    position: 'Job title (e.g., Chief Employee Officer)',
    phoneNumber: 'Phone Number with country code (e.g., +1 (555) 123-4567)',
  });
  
  worksheet.addRow({
    instructions: 'Example Entry 1:',
    name: 'John Smith',
    email: 'john.smith@company.com',
    position: 'Chief Employee Officer',
    phoneNumber: '+1 (555) 123-4567',
  });
  
  worksheet.addRow({
    instructions: 'Example Entry 2:',
    name: 'Jane Doe',
    email: 'jane.doe@company.com',
    position: 'Chief Financial Officer',
    phoneNumber: '+1 (555) 987-6543',
  });

  // Generate excel file and save
  workbook.xlsx.writeBuffer().then(buffer => {
    const data = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, 'employee-template.xlsx');
  });
}

export async function uploadExcel(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    
    const worksheet = workbook.getWorksheet(1); // Get first worksheet
    
    if (!worksheet) {
      throw new Error('No worksheet found in the Excel file');
    }
    
    // Convert worksheet to JSON
    const jsonData: any[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const rowData: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Map column indices to property names using the header row
        const header = worksheet.getRow(1).getCell(colNumber).value?.toString() || `Column${colNumber}`;
        rowData[header] = cell.value?.toString() || '';
      });
      
      jsonData.push(rowData);
    });

    // Filter out instruction rows and format data
    const employees = jsonData
      .filter(row => !String(row['__INSTRUCTIONS__'] || '').includes('Please follow'))
      .map(row => ({
        name: String(row.name || ''),
        email: String(row.email || ''),
        phoneNumber: String(row.phoneNumber || ''),
        position: String(row.position || ''),
        currentPlan: null,
        dataLimit: "0"
      }));

    if (employees.length === 0) {
      throw new Error('No valid employee data found in the Excel file');
    }

    // Send the employees array directly
    await apiRequest('/api/employees/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(employees) // Send array directly, not wrapped in an object
    });

    // Refresh the employees data
    await queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
  } catch (error) {
    console.error('Failed to upload employees:', error);
    throw error;
  }
}