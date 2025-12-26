
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import type { Employee, PurchasedEsim, EsimPlan } from "@shared/schema";
import { useState, useEffect } from "react";
import { getEmployeePlanInfo } from "@/lib/utils/planCalculations";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="p-3 bg-white border rounded-md shadow-md">
      <p className="font-bold mb-2">{label}</p>
      {payload.map((entry: any, index: number) => {
        const displayValue = `${entry.value.toFixed(2)} GB`;
          
        return (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {displayValue}
          </p>
        );
      })}
    </div>
  );
};

export default function UsageChart({ 
  employees, 
  purchasedEsims = [], 
  allPlans = [] 
}: { 
  employees: Employee[];
  purchasedEsims?: PurchasedEsim[];
  allPlans?: EsimPlan[];
}) {
  // Process data using plan calculation system
  const data = employees
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((exec) => {
      const planInfo = getEmployeePlanInfo(exec.id, purchasedEsims, allPlans);
      
      return {
        name: exec.name,
        usage: planInfo.totalDataUsage || 0,
        limit: planInfo.totalDataLimit || 0,
      };
    });

  // Calculate width based on number of employees (minimum 1200px)
  const chartWidth = Math.max(1200, data.length * 100);

  // Log the processed data for debugging
  // Usage chart data processed

  return (
    <div className="h-[400px] w-full overflow-x-auto">
      <div style={{ width: `${chartWidth}px`, height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
            />
            <YAxis label={{ value: 'Data (GB)', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="usage" fill="hsl(var(--primary))" name="Data Usage" barSize={40} />
            <Bar dataKey="limit" fill="hsl(var(--muted))" name="Data Limit" barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
