
import React from 'react';

export const StockCardSkeleton: React.FC = () => (
  <div className="animate-pulse bg-gray-900 border border-gray-800 rounded-xl p-5">
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 bg-gray-800 rounded"></div>
        <div>
          <div className="h-5 w-16 bg-gray-800 rounded mb-2"></div>
          <div className="h-3 w-24 bg-gray-800 rounded"></div>
        </div>
      </div>
      <div className="text-right">
        <div className="h-6 w-20 bg-gray-800 rounded mb-2"></div>
        <div className="h-4 w-12 bg-gray-800 rounded"></div>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-4 mb-4">
      <div className="h-8 bg-gray-800 rounded"></div>
      <div className="h-8 bg-gray-800 rounded"></div>
      <div className="h-8 bg-gray-800 rounded"></div>
    </div>
  </div>
);

export const AnalysisSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6">
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="h-6 w-48 bg-gray-800 rounded mb-4"></div>
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-800 rounded"></div>
        ))}
      </div>
    </div>
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="h-6 w-32 bg-gray-800 rounded mb-4"></div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-800 rounded"></div>
        ))}
      </div>
    </div>
  </div>
);

export const TableRowSkeleton: React.FC = () => (
  <tr className="animate-pulse">
    <td className="p-4"><div className="h-5 w-16 bg-gray-800 rounded"></div></td>
    <td className="p-4"><div className="h-5 w-20 bg-gray-800 rounded"></div></td>
    <td className="p-4"><div className="h-5 w-12 bg-gray-800 rounded"></div></td>
    <td className="p-4"><div className="h-5 w-16 bg-gray-800 rounded"></div></td>
    <td className="p-4 hidden md:table-cell"><div className="h-5 w-16 bg-gray-800 rounded"></div></td>
    <td className="p-4 hidden md:table-cell"><div className="h-5 w-12 bg-gray-800 rounded"></div></td>
  </tr>
);
