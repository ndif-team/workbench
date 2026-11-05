"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ComparisonOption } from "./comparison";

/** Chooses which saved algorithms a chart's Intervene and Sweep run alongside
 * its own. All of them until the first change. */
export function CompareMenu({
    options,
    shown,
    onChange,
}: {
    options: ComparisonOption[];
    shown?: string[];
    onChange: (ids: string[]) => void;
}) {
    if (!options.length) return null;
    const isShown = (id: string) => !shown || shown.includes(id);
    const count = options.filter((o) => isShown(o.id)).length;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    Compare {count} of {options.length}
                    <ChevronDown />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                {options.map((o) => (
                    <DropdownMenuCheckboxItem
                        key={o.id}
                        checked={isShown(o.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) =>
                            onChange(
                                options
                                    .filter((x) => (x.id === o.id ? checked : isShown(x.id)))
                                    .map((x) => x.id),
                            )
                        }
                    >
                        {o.name}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
