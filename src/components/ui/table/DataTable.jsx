import React, { useState, useId } from 'react';
import { Download, Copy, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DraggableModal } from '../modal/DraggableModal';
import PropTypes from 'prop-types';

const TableContent = ({ data }) => (
  <table className="w-full table-auto border-collapse text-xs border border-white/20">
    <thead>
      <tr className="border-b border-white/20">
        {Object.keys(data[0]).map((header, i) => (
          <th
            key={i}
            className="bg-white/10 px-3 py-1.5 text-left font-medium text-white/90 first:rounded-tl-md last:rounded-tr-md border-x border-white/20 whitespace-nowrap"
          >
            {header}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {data.map((row, i) => (
        <tr
          key={i}
          className={cn(
            "border-b border-white/20 transition-colors hover:bg-white/10",
            i % 2 === 0 ? "bg-transparent" : "bg-white/5",
            i === data.length - 1 && "last:border-0"
          )}
        >
          {Object.values(row).map((cell, j) => (
            <td
              key={j}
              className="px-3 py-1.5 text-white/80 border-x border-white/20 min-w-[200px] max-w-[300px] break-words"
            >
              {String(cell)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

TableContent.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired
};

export const DataTable = ({ data, className }) => {
  const [fullscreenInstances, setFullscreenInstances] = useState(new Set());
  const tableId = useId();

  if (!data || !data.length) return null;

  const handleCopy = () => {
    // Convert table to CSV
    const headers = Object.keys(data[0]).join('\t');
    const rows = data.map(row => Object.values(row).join('\t')).join('\n');
    const text = `${headers}\n${rows}`;
    
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    // Convert table to CSV
    const csv = data.map(row => {
      return Object.values(row).map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    }).join('\n');
    
    // Add headers
    const headers = Object.keys(data[0]).map(header => `"${header}"`).join(',');
    const csvWithHeaders = `${headers}\n${csv}`;
    
    // Create and trigger download
    const blob = new Blob([csvWithHeaders], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'table.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const openFullscreen = () => {
    setFullscreenInstances(prev => new Set(prev).add(tableId));
  };

  const closeFullscreen = () => {
    setFullscreenInstances(prev => {
      const newSet = new Set(prev);
      newSet.delete(tableId);
      return newSet;
    });
  };

  return (
    <>
      <div className={cn("relative group rounded-md bg-secondary/30", className)}>
        <div className="overflow-x-auto rounded-md">
          <TableContent data={data} />
        </div>
        <div className="mt-2 ml-auto flex items-center gap-2 justify-end">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/20 text-white/80 text-xs hover:bg-white/5 transition-colors"
          >
            <Copy className="h-3 w-3" />
            <span>Copy</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/20 text-white/80 text-xs hover:bg-white/5 transition-colors"
          >
            <Download className="h-3 w-3" />
            <span>Download CSV</span>
          </button>
          <button
            onClick={openFullscreen}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/20 text-white/80 text-xs hover:bg-white/5 transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Full Screen</span>
          </button>
        </div>
      </div>

      {fullscreenInstances.has(tableId) && (
        <DraggableModal
          title="Table View"
          onClose={closeFullscreen}
          defaultPosition={{ x: 40, y: 40 }}
          resizable={true}
          defaultWidth={500}
          defaultHeight={400}
          minWidth={300}
          minHeight={200}
        >
          <div className="overflow-auto h-full">
            <TableContent data={data} />
          </div>
        </DraggableModal>
      )}
    </>
  );
};

DataTable.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  className: PropTypes.string
};
