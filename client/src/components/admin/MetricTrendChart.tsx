import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Define the possible chart types
export type ChartType = "line" | "area" | "bar";

// Define the metric data point interface
export interface MetricDataPoint {
  date: string;
  value: number;
}

interface MetricTrendChartProps {
  title: string;
  description?: string;
  data: MetricDataPoint[];
  chartType?: ChartType;
  valueLabel?: string;
  color?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  hideCard?: boolean;
}

export default function MetricTrendChart({
  title,
  description = "Monthly trend",
  data,
  chartType = "line",
  valueLabel = "Value",
  color = "hsl(var(--primary))",
  valueFormatter = (value) => value.toString(),
  height = 300,
  hideCard = false,
}: MetricTrendChartProps) {
  // Check if we have valid data to display
  const hasValidData = Array.isArray(data) && data.length > 0;

  // Render "No data available" message when there's no data
  if (!hasValidData) {
    const NoDataContent = (
      <div 
        className="flex flex-col items-center justify-center text-center h-full w-full bg-gray-50 rounded-md"
        style={{ height: `${height}px` }}
      >
        <p className="text-gray-500 mb-1">No data available</p>
        <p className="text-xs text-gray-400">
          There is insufficient data to display this chart
        </p>
      </div>
    );

    // Return either just the content or wrapped in a card based on hideCard prop
    return hideCard ? NoDataContent : (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <p className="text-sm text-gray-500">{description}</p>
        </CardHeader>
        <CardContent>
          {NoDataContent}
        </CardContent>
      </Card>
    );
  }

  // Determine which chart to render based on the chartType prop
  const renderChart = () => {
    switch (chartType) {
      case "area":
        return (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                <stop offset="95%" stopColor={color} stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={valueFormatter} />
            <Tooltip 
              formatter={(value: number) => [valueFormatter(value), valueLabel]} 
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fillOpacity={1}
              fill="url(#colorGradient)"
              name={valueLabel}
            />
          </AreaChart>
        );
      case "bar":
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={valueFormatter} />
            <Tooltip 
              formatter={(value: number) => [valueFormatter(value), valueLabel]} 
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Bar
              dataKey="value"
              fill={color}
              name={valueLabel}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        );
      case "line":
      default:
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={valueFormatter} />
            <Tooltip 
              formatter={(value: number) => [valueFormatter(value), valueLabel]} 
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              name={valueLabel}
              dot={{ r: 4, strokeWidth: 1 }}
            />
          </LineChart>
        );
    }
  };

  const ChartContent = (
    <div style={{ width: "100%", height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );

  // Return either just the chart or wrapped in a card based on hideCard prop
  return hideCard ? ChartContent : (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <p className="text-sm text-gray-500">{description}</p>
      </CardHeader>
      <CardContent>
        {ChartContent}
      </CardContent>
    </Card>
  );
}