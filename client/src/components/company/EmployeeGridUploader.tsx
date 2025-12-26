import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { X, Plus, AlertCircle, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// Helper functions for name formatting
const capitalizeMultiWord = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const splitFullName = (fullName: string): { firstName: string, lastName: string } => {
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  }
  // First word is firstName, rest is lastName
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  return { firstName, lastName };
};

interface EmployeeGridUploaderProps {
  onComplete?: () => void;
}

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phoneNumber: string;
  errors: Record<string, string>;
}

const defaultRow = (): EmployeeRow => ({
  id: Math.random().toString(36).substr(2, 9),
  firstName: '',
  lastName: '',
  position: '',
  email: '',
  phoneNumber: '',
  errors: {},
});

const columns = [
  { field: 'firstName', header: 'First Name', width: 180 },
  { field: 'lastName', header: 'Last Name', width: 180 },
  { field: 'position', header: 'Position', width: 180 },
  { field: 'email', header: 'Email', width: 250 },
  { field: 'phoneNumber', header: 'Phone Number', width: 180 },
];

export default function EmployeeGridUploader({ onComplete }: EmployeeGridUploaderProps) {
  const [rows, setRows] = useState<EmployeeRow[]>([defaultRow()]);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [focusedCell, setFocusedCell] = useState<{ rowId: string, field: string } | null>(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState<boolean>(false);
  const tableRef = useRef<HTMLTableElement>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    // Validate all rows and update isValid state
    const allValid = rows.length > 0 && rows.every(row => 
      row.firstName.trim() !== '' && 
      row.lastName.trim() !== '' && 
      row.position.trim() !== '' && 
      row.email.trim() !== '' && 
      row.phoneNumber.trim() !== '' &&
      Object.keys(row.errors).length === 0
    );
    setIsValid(allValid);
  }, [rows]);

  // Format the name as the user types
  const formatName = (value: string, field: 'firstName' | 'lastName') => {
    return capitalizeMultiWord(value);
  };

  // Validate email format
  const validateEmail = (email: string): string => {
    return email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) 
      ? 'Invalid email format' 
      : '';
  };

  // Handle cell value changes
  const handleCellChange = (value: string, rowId: string, field: keyof EmployeeRow) => {
    setRows(prevRows => 
      prevRows.map(row => {
        if (row.id !== rowId) return row;
        
        const updatedRow = { ...row };
        
        // Apply formatting based on field type
        if (field === 'firstName' || field === 'lastName') {
          updatedRow[field] = formatName(value, field as 'firstName' | 'lastName');
        } else if (field === 'errors') {
          // Don't modify errors directly
        } else {
          updatedRow[field as keyof Omit<EmployeeRow, 'errors'>] = value as any;
        }
        
        // Validate fields
        const errors = { ...updatedRow.errors };
        
        if (field === 'email') {
          const emailError = validateEmail(value);
          if (emailError) {
            errors.email = emailError;
          } else {
            delete errors.email;
          }
        }
        
        // Check for required fields
        ['firstName', 'lastName', 'position', 'email', 'phoneNumber'].forEach(fieldName => {
          const typedField = fieldName as keyof EmployeeRow;
          if (typedField === field) {
            if (!updatedRow[typedField] || updatedRow[typedField] === '') {
              errors[fieldName] = 'Required';
            } else {
              delete errors[fieldName];
            }
          }
        });
        
        updatedRow.errors = errors;
        return updatedRow;
      })
    );
  };

  // Add a new row
  const addRow = () => {
    setRows([...rows, defaultRow()]);
  };

  // Remove a row
  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      // If it's the last row, clear it instead of removing
      setRows([defaultRow()]);
    } else {
      setRows(rows.filter(row => row.id !== rowId));
    }
  };

  // Handle clipboard paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTableElement>) => {
    e.preventDefault();
    
    // Get clipboard data and split into rows
    const clipboardData = e.clipboardData.getData('text/plain');
    const pastedRows = clipboardData
      .split(/\r?\n/)
      .filter(line => line.trim() !== '');
    
    if (pastedRows.length === 0) return;
    
    // Create new rows from the pasted data
    const newRows = pastedRows.map(rowData => {
      const cells = rowData.split(/\t/);
      const row = defaultRow();
      
      // Look for column patterns in the cells
      // If we have exactly the right number of columns, we can do direct mapping
      if (cells.length === 5) {
        row.firstName = capitalizeMultiWord(cells[0]?.trim() || '');
        row.lastName = capitalizeMultiWord(cells[1]?.trim() || '');
        row.position = capitalizeMultiWord(cells[2]?.trim() || '');
        row.email = cells[3]?.trim() || '';
        row.phoneNumber = cells[4]?.trim() || '';
      }
      // Special case for the pattern we observed in the screenshot
      else if (cells.length === 4) {
        // In this case, it looks like: Last Name, Position, Email, Phone
        // And we need to split Last Name into First/Last
        const fullName = cells[0]?.trim() || '';
        const { firstName, lastName } = splitFullName(fullName);
        
        row.firstName = capitalizeMultiWord(firstName);
        row.lastName = capitalizeMultiWord(lastName);
        row.position = capitalizeMultiWord(cells[1]?.trim() || '');
        row.email = cells[2]?.trim() || '';
        row.phoneNumber = cells[3]?.trim() || '';
      }
      // Otherwise try to intelligently determine which column is which
      else {
        for (let i = 0; i < Math.min(cells.length, 5); i++) {
          const value = cells[i]?.trim() || '';
          
          // Email detection - always assign to email if it contains @
          if (value.includes('@') && !row.email) {
            row.email = value;
            continue;
          }
          
          // Phone number detection
          if ((value.startsWith('+') || /^[\d\s\-\(\)\.]+$/.test(value)) && !row.phoneNumber) {
            row.phoneNumber = value;
            continue;
          }
          
          // Position detection - typically shorter than names
          if (value.length < 10 && !value.includes(' ') && !row.position) {
            row.position = capitalizeMultiWord(value);
            continue;
          }
          
          // Names - assign to first and last name fields
          if (!row.firstName) {
            row.firstName = capitalizeMultiWord(value);
            continue;
          }
          
          if (!row.lastName) {
            row.lastName = capitalizeMultiWord(value);
            continue;
          }
          
          // Any remaining fields
          if (!row.position) row.position = capitalizeMultiWord(value);
          else if (!row.email) row.email = value;
          else if (!row.phoneNumber) row.phoneNumber = value;
        }
      }
      
      // Check for single-column names and split them appropriately
      if (row.firstName.includes(' ') && row.lastName === '') {
        const nameParts = splitFullName(row.firstName);
        row.firstName = capitalizeMultiWord(nameParts.firstName);
        row.lastName = capitalizeMultiWord(nameParts.lastName);
      }
      
      // Ensure both name parts are capitalized correctly
      row.firstName = capitalizeMultiWord(row.firstName);
      row.lastName = capitalizeMultiWord(row.lastName);
      
      // Validate email format only (required validation happens on save)
      if (row.email) {
        const emailError = validateEmail(row.email);
        if (emailError) {
          row.errors.email = emailError;
        }
      }
      
      return row;
    });
    
    // Replace the current rows with the new ones
    setRows(newRows);
  };

  // Submit the data
  const saveEmployeesMutation = useMutation({
    mutationFn: async (data: any[]) => {
      return apiRequest('/api/employees/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({
        title: "Success",
        description: `${rows.length} employees added successfully`,
      });
      setRows([defaultRow()]);
      if (onComplete) onComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add employees",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Mark that user has attempted to save (to show validation errors)
    setHasAttemptedSave(true);
    
    // Validate all rows and add errors for empty required fields
    const validatedRows = rows.map(row => {
      const errors: Record<string, string> = { ...row.errors };
      ['firstName', 'lastName', 'position', 'email', 'phoneNumber'].forEach(field => {
        if (!row[field as keyof EmployeeRow] || (row[field as keyof EmployeeRow] as string).trim() === '') {
          errors[field] = 'Required';
        }
      });
      return { ...row, errors };
    });
    setRows(validatedRows);
    
    // Check if all rows are valid
    const allValid = validatedRows.every(row => Object.keys(row.errors).length === 0);
    if (!allValid) {
      return;
    }
    
    // Format data for API
    const employeesData = validatedRows.map(row => ({
      name: `${row.firstName} ${row.lastName}`.trim(),
      position: row.position,
      email: row.email,
      phoneNumber: row.phoneNumber,
    }));
    
    saveEmployeesMutation.mutate(employeesData);
  };

  // Count valid and total rows
  const validRows = rows.filter(row => 
    row.firstName.trim() !== '' && 
    row.lastName.trim() !== '' && 
    row.position.trim() !== '' && 
    row.email.trim() !== '' && 
    row.phoneNumber.trim() !== '' &&
    Object.keys(row.errors).length === 0
  ).length;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-2">
        <p>Add a single employee using the form below or paste multiple employees from Excel. All fields are required.</p>
        <p className="mt-1">Tip: You can copy multiple rows from Excel and paste them all at once directly into the table.</p>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table ref={tableRef} onPaste={handlePaste} className="min-w-full">
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                {columns.map(column => (
                  <TableHead 
                    key={column.field} 
                    style={{ minWidth: column.width }}
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b"
                  >
                    {column.header} *
                  </TableHead>
                ))}
                <TableHead className="w-16 px-2 py-3 border-b"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id} className="hover:bg-gray-50/30 transition-colors">
                  {columns.map(column => {
                    const field = column.field as keyof EmployeeRow;
                    const error = row.errors[field];
                    const isFocused = focusedCell?.rowId === row.id && focusedCell?.field === field;
                    
                    return (
                      <TableCell key={`${row.id}-${field}`} className="p-2">
                        <div className="relative">
                          <Input
                            value={row[field] as string}
                            onChange={(e) => handleCellChange(e.target.value, row.id, field)}
                            onFocus={() => setFocusedCell({ rowId: row.id, field })}
                            onBlur={() => setFocusedCell(null)}
                            className={`
                              h-10 px-3 text-sm border-gray-200 rounded-md
                              focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                              transition-all duration-200
                              ${hasAttemptedSave && error ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100' : 'bg-white'}
                            `}
                            placeholder={`Enter ${column.header.toLowerCase()}`}
                            autoFocus={isFocused}
                          />
                          {hasAttemptedSave && error && !isFocused && (
                            <div className="absolute inset-y-0 right-3 flex items-center text-red-500">
                              <AlertCircle size={16} />
                            </div>
                          )}
                          {hasAttemptedSave && error && (
                            <div className="mt-1 text-xs text-red-600">{error}</div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="p-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove row"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={addRow}
          className="flex items-center"
        >
          <Plus className="mr-1 h-4 w-4" /> Add Row
        </Button>
        
        <div className="flex items-center space-x-4">
          <div className="text-sm">
            <Badge variant={validRows === rows.length ? "default" : "outline"} className="mr-2">
              {validRows}/{rows.length} valid
            </Badge>
          </div>
          
          <Button
            onClick={handleSubmit}
            disabled={!isValid || saveEmployeesMutation.isPending}
          >
            {saveEmployeesMutation.isPending ? "Saving..." : "Save Employees"}
          </Button>
        </div>
      </div>
      
      {hasAttemptedSave && rows.some(row => Object.keys(row.errors).length > 0) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fix errors</AlertTitle>
          <AlertDescription>
            Please fix all the highlighted errors before saving.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}