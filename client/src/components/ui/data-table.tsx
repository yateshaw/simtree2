import React from "react"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Column<T> {
  key: string;
  label: string | React.ReactNode;
  render?: (item: T) => React.ReactNode;
  width?: string; // Optional width for the column
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  selectableRows?: boolean;
  selectedRows?: number[];
  onSelectedRowsChange?: (selectedRows: number[]) => void;
  getRowClassName?: (row: T) => string;
  expandedRows?: Set<any>;
  renderSubRows?: (item: T) => React.ReactNode | null;
}

export function DataTable<T>({ 
  data, 
  columns, 
  onRowClick, 
  selectableRows, 
  selectedRows, 
  onSelectedRowsChange,
  getRowClassName,
  expandedRows,
  renderSubRows
}: DataTableProps<T>) {
  return (
    <Card className="border rounded-lg p-0 shadow-sm" style={{ width: '100%' }}>
      <div className="w-full overflow-x-auto">
        <div className="w-full">
          <Table style={{ width: '100%' }}>
            <TableHeader>
              <TableRow className="bg-gray-50 border-b">
                {columns.map((column) => (
                  <TableHead 
                    key={column.key}
                    className="h-10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    style={{
                      width: column.width || "auto",
                      minWidth: column.width || "auto",
                      maxWidth: column.width ? undefined : "300px"
                    }}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((item, index) => {
                  const isExpanded = expandedRows?.has((item as any).id);
                  const subRows = renderSubRows && isExpanded ? renderSubRows(item) : null;
                  
                  return (
                    <React.Fragment key={`main-row-${index}`}>
                      <TableRow 
                        onClick={() => onRowClick?.(item)}
                        className={`cursor-pointer hover:bg-gray-50 border-b ${
                          // Apply custom row class if provided
                          getRowClassName ? getRowClassName(item) : (
                            // Default styling
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          )
                        }`}
                      >
                        {columns.map((column) => (
                          <TableCell 
                            key={column.key}
                            className="px-4 py-3 text-sm text-gray-900"
                            style={{
                              width: column.width || "auto",
                              minWidth: column.width || "auto",
                              maxWidth: column.width ? undefined : "300px"
                            }}
                          >
                            {column.render ? column.render(item) : (item as any)[column.key]}
                          </TableCell>
                        ))}
                      </TableRow>
                      {subRows}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  )
}