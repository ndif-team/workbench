import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useState } from "react";

const decoders = ["Probability", "Entropy", "Rank"]

export function DecoderSelector() {
    const [selectedDecoder, setSelectedDecoder] = useState<string>("Probability");

    return (
        <Select value={selectedDecoder} onValueChange={setSelectedDecoder}>
            <SelectTrigger className="w-fit border-none gap-3 shadow-none pr-1 text-xs focus-visible:ring-0 hover:bg-accent">
                <SelectValue placeholder="Select a decoder" />
            </SelectTrigger>
            <SelectContent>
                {decoders.map((decoder) => (
                    <SelectItem key={decoder} value={decoder}>{decoder}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
