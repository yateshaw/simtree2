/**
 * Formats a number as a currency string.
 * @param amount - The amount to format
 * @param currency - The currency code (default: USD)
 * @returns A formatted currency string
 */
export function formatCurrency(amount: number | string, currency: string = 'USD'): string {
  // Convert string to number if needed
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Handle NaN case
  if (isNaN(numAmount)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }
  
  // Format the currency
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

/**
 * Formats a date string to a human-readable format.
 * @param dateString - The date string to format
 * @param format - The format to use (default: 'medium')
 * @returns A formatted date string
 */
export function formatDate(
  dateString: string | Date | null | undefined,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (!dateString) return 'N/A';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  // Check for invalid date
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  let options: Intl.DateTimeFormatOptions;
  
  switch (format) {
    case 'short':
      options = { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      };
      break;
    case 'long':
      options = { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      break;
    case 'medium':
    default:
      options = { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      break;
  }
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

/**
 * Formats a file size in bytes to a human-readable string.
 * @param bytes - The size in bytes
 * @returns A formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formats a percentage value.
 * @param value - The percentage value (0-100)
 * @param decimals - Number of decimal places
 * @returns A formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Truncates a string if it exceeds a maximum length.
 * @param str - The string to truncate
 * @param maxLength - The maximum length
 * @returns The truncated string
 */
export function truncateString(str: string, maxLength: number = 50): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}