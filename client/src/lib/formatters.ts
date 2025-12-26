/**
 * Utility functions for consistent data formatting across the application
 */

// Constants for conversion
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * 1024;
export const BYTES_PER_GB = 1024 * 1024 * 1024;

interface DataUsageResult {
  displayUsed: string;          // Formatted used value
  displayLimit: string;         // Formatted limit value
  displayUnit: string;          // Unit (MB or GB)
  percentage: number;           // Usage percentage (0-100)
  formattedString: string;      // Full formatted string (e.g., "44/100MB 44%")
  rawUsedValue: number;         // Raw value in the display unit
  rawLimitValue: number;        // Raw value in the display unit
}

/**
 * Standardized function to format data usage consistently throughout the application
 * 
 * @param dataUsed - String or number representing the amount of data used (can be in bytes, or already in MB/GB)
 * @param dataLimit - String or number representing the maximum data limit (can be in bytes, or already in MB/GB)
 * @param assumeBytes - If true, assumes input values are in bytes unless very small
 * @param forceUnit - Force specific unit display ("MB", "GB", or undefined to auto-select)
 * @returns Formatted data usage object with various display options
 */
export function formatDataUsage(
  dataUsed: string | number, 
  dataLimit: string | number,
  assumeBytes: boolean = true,
  forceUnit?: 'MB' | 'GB'
): DataUsageResult {
  // Convert inputs to numbers if they're strings
  const usedNumber = typeof dataUsed === 'string' ? parseFloat(dataUsed || '0') : dataUsed || 0;
  const limitNumber = typeof dataLimit === 'string' ? parseFloat(dataLimit || '0') : dataLimit || 0;
  
  // Convert to bytes if necessary based on size heuristics
  let usedBytes = usedNumber;
  let limitBytes = limitNumber;
  
  if (assumeBytes) {
    // Already in bytes - no conversion needed
  } else {
    // Apply heuristics based on value sizes
    if (usedNumber > 1000000) {
      // Very large number - probably already in bytes
      usedBytes = usedNumber;
    } else if (usedNumber > 1000) {
      // Medium number - probably in KB
      usedBytes = usedNumber * BYTES_PER_KB;
    } else if (usedNumber > 100) {
      // Smallish number - probably in MB
      usedBytes = usedNumber * BYTES_PER_MB;
    } else {
      // Very small number - probably in GB
      usedBytes = usedNumber * BYTES_PER_GB;
    }
    
    // Same logic for limit
    if (limitNumber > 1000000) {
      limitBytes = limitNumber;
    } else if (limitNumber > 1000) {
      limitBytes = limitNumber * BYTES_PER_KB;
    } else if (limitNumber > 100) {
      limitBytes = limitNumber * BYTES_PER_MB;
    } else {
      limitBytes = limitNumber * BYTES_PER_GB;
    }
  }
  
  // Convert to GB for internal calculations
  const usedGB = usedBytes / BYTES_PER_GB;
  const limitGB = limitBytes / BYTES_PER_GB;
  
  // Determine display unit (MB only when limit is less than 1GB, otherwise GB)
  // This can be overridden by forceUnit
  let unit = forceUnit;
  if (!unit) {
    unit = (limitGB < 1) ? 'MB' : 'GB';
  }
  
  // Format for display based on unit
  let displayUsed: string;
  let displayLimit: string;
  let rawUsedValue: number;
  let rawLimitValue: number;
  
  if (unit === 'MB') {
    // Convert GB to MB and round appropriately
    rawUsedValue = usedGB * 1024;
    rawLimitValue = limitGB * 1024;
    
    // For very small values (< 0.1 MB), show 2 decimal places
    if (rawUsedValue < 0.1 && rawUsedValue > 0) {
      displayUsed = rawUsedValue.toFixed(2);
    } else {
      // For normal MB values, round to whole numbers
      displayUsed = Math.round(rawUsedValue).toString();
    }
    
    // Same for limit
    if (rawLimitValue < 0.1 && rawLimitValue > 0) {
      displayLimit = rawLimitValue.toFixed(2);
    } else {
      displayLimit = Math.round(rawLimitValue).toString();
    }
  } else {
    // GB values - show 2 decimal places
    rawUsedValue = usedGB;
    rawLimitValue = limitGB;
    displayUsed = usedGB.toFixed(2);
    displayLimit = limitGB.toFixed(2);
  }
  
  // Calculate percentage (handle division by zero)
  const percentage = limitGB > 0 
    ? Math.min(Math.round((usedGB / limitGB) * 100), 100)
    : 0;
  
  // Create the full formatted string
  const formattedString = `${displayUsed}/${displayLimit}${unit} ${percentage}%`;
  
  return {
    displayUsed,
    displayLimit,
    displayUnit: unit,
    percentage,
    formattedString,
    rawUsedValue,
    rawLimitValue
  };
}

/**
 * Simple function to format a data size value to appropriate units (B, KB, MB, GB, TB)
 * 
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places to show
 * @returns Formatted string with appropriate unit
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}