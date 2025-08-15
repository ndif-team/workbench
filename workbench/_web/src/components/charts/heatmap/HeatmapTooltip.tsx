import React from 'react';
import { BasicTooltip } from '@nivo/tooltip';
import { HeatmapCell, TokenProb } from '@/types/charts';

// Use Nivo's expected ComputedCell type structure
interface MyCell<T> {
    id: string;
    serieId: string;
    data: T;
    formattedValue: string | null;
    value: number | null;
    color: string;
    opacity: number;
    borderColor: string;
    label: string;
    labelTextColor: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface HeatmapTooltipProps {
    cell: MyCell<HeatmapCell>;
}

export const HeatmapTooltip: React.FC<HeatmapTooltipProps> = ({ cell }) => {
    if (cell.formattedValue === null) return null;

    const { data } = cell.data;

    // Extract row and column labels
    const rowLabel = cell.serieId.split('-')[0];
    const columnLabel = cell.data.x;

    // If no custom tooltip data, fall back to default
    if (!data || data.length === 0) {
        return (
            <BasicTooltip
                id={`${cell.serieId} - ${cell.data.x}`}
                value={cell.formattedValue || ''}
                enableChip={true}
                color={cell.color}
            />
        );
    }

    return (
        <div className="bg-popover text-popover-foreground text-xs rounded shadow-lg border">
            {/* Header with color chip and labels */}
            <div className="flex items-center gap-2 p-2 border-b">
                <div 
                    className="w-2.5 h-2.5 border border-gray-300"
                    style={{ backgroundColor: cell.color }}
                />
                <span className="font-medium text-foreground text-xs">
                    {rowLabel}
                </span>
                <span className="text-muted-foreground text-xs">•</span>
                <span className="font-medium text-foreground text-xs">
                    {columnLabel}
                </span>
            </div>
            
            {/* Token probability list */}
            <div className="p-2 space-y-0.5">
                {data.map((item, index) => (
                    <div key={index} className="flex items-center justify-between font-mono text-xs">
                        <span className={`text-foreground ${index === 0 ? 'font-bold' : ''}`}>
                            {item.id}
                        </span>
                        <span className={`text-right ml-2 ${index === 0 ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'}`}>
                            {item.prob.toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}; 