import { useCallback, useMemo, useState } from "react";
import { ToolOptions } from "@/lib/toolOptions";
import type { ToolOption, ToolOptionValues } from "@/types/models";

/**
 * A tool's Controls' state for the options its model offers (`ToolOptions.of`).
 *
 * The picks start from the chart's saved ones and are kept while another
 * model is selected, but only what the selected model offers reaches a config
 * or a run: `values` is `undefined` for a model that offers nothing.
 *
 * @param options The options the tool takes on the selected model.
 * @param saved The picks in the chart's saved config.
 */
export function useToolOptions(options: ToolOption[], saved: ToolOptionValues | undefined) {
    const [picked, setPicked] = useState<ToolOptionValues>(saved ?? {});

    const values = useMemo(() => ToolOptions.values(options, picked), [options, picked]);
    const matchesSaved = useMemo(
        () => ToolOptions.equal(values, ToolOptions.values(options, saved)),
        [values, options, saved],
    );

    const pick = useCallback(
        (name: string, value: string) => setPicked((before) => ({ ...before, [name]: value })),
        [],
    );
    const reset = useCallback(() => setPicked(saved ?? {}), [saved]);

    return {
        /** The options offered. */
        options,
        /** What a run sends and a config saves. */
        values,
        /** Whether the saved config would run with the same values. */
        matchesSaved,
        pick,
        /** Goes back to the saved picks. */
        reset,
    };
}
