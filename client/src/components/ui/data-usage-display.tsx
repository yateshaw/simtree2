import React from 'react';

interface DataUsageDisplayProps {
  dataUsage: string | number;
  dataLimit: string | number;
  planName?: string;
}

function DataUsageDisplay({ dataUsage, dataLimit, planName = '' }: DataUsageDisplayProps) {
  // Parse values as numbers
  const usageNum = parseFloat(String(dataUsage || '0'));
  const limitNum = parseFloat(String(dataLimit || '0'));
  
  // Calculate percentage safely
  const percentage = limitNum > 0 ? Math.min((usageNum / limitNum) * 100, 100) : 0;

  // Always use GB format with consistent precision
  const displayUsage = usageNum.toFixed(2);
  const displayLimit = limitNum.toFixed(2);
  const unit = 'GB';

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="text-lg font-bold mb-2">USAGE</div>
      <div className="text-gray-600 mb-4">
        {displayUsage}/{displayLimit} {unit} {percentage > 0 ? `${Math.round(percentage)}%` : '0%'}
      </div>
      <div className="w-full bg-muted h-1 rounded">
        <div
          className={`bg-primary h-1 rounded transition-all ${
            percentage > 90 ? "bg-red-500" : 
            percentage > 70 ? "bg-yellow-500" : 
            "bg-green-500"
          }`}
          style={{ width: `${Math.round(percentage)}%` }}
        ></div>
      </div>
    </div>
  );
}

export default DataUsageDisplay;