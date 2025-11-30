import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const data = [
  { name: 'Mon', price: 10.5 },
  { name: 'Tue', price: 11.2 },
  { name: 'Wed', price: 10.8 },
  { name: 'Thu', price: 12.1 },
  { name: 'Fri', price: 11.9 },
  { name: 'Sat', price: 13.5 },
  { name: 'Sun', price: 14.2 },
];

const StockChart: React.FC<{ color?: string }> = ({ color = "#10B981" }) => {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 10,
            left: 0,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#9CA3AF" 
            tick={{fontSize: 12}} 
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            stroke="#9CA3AF" 
            tick={{fontSize: 12}} 
            domain={['dataMin - 1', 'dataMax + 1']} 
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
            itemStyle={{ color: '#F3F4F6' }}
            labelStyle={{ color: '#9CA3AF' }}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke={color} 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#1F2937', strokeWidth: 2 }} 
            activeDot={{ r: 6 }} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
