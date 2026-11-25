import type { ToolType } from "@/types/charts";
import type { Model, ToolChoice, ToolOption, ToolOptionValues } from "@/types/models";

/**
 * The options a tool takes on a model beyond its own parameters, such as a
 * looped model's lens and patch. nnsightful declares them and the backend
 * lists them with each model (`Model.tool_options`), so nothing here names
 * one: a tool's controls draw whatever its model offers (`ToolOptionControls`)
 * and its config and run carry the picks by name (`ToolOptionValues`).
 */
export class ToolOptions {
    private static readonly NONE: ToolOption[] = [];

    /** The options `tool` takes on `model`: none on most models, and none
     *  while the catalog has not listed the model. */
    static of(model: Model | undefined, tool: ToolType): ToolOption[] {
        return model?.tool_options?.[tool] ?? ToolOptions.NONE;
    }

    /**
     * The value each of `options` runs with: the picked one while the option
     * still takes it, else its default. `undefined` when there are no
     * options, so that a config and a run then carry none.
     */
    static values(
        options: ToolOption[],
        picked: ToolOptionValues | undefined,
    ): ToolOptionValues | undefined {
        if (options.length === 0) return undefined;
        return Object.fromEntries(
            options.map((option) => {
                const value = picked?.[option.name];
                const offered = option.choices.some((choice) => choice.value === value);
                return [option.name, offered ? (value as string) : option.default];
            }),
        );
    }

    /** Whether two sets of values pick the same value for every option. */
    static equal(a: ToolOptionValues | undefined, b: ToolOptionValues | undefined): boolean {
        const names = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
        return [...names].every((name) => a?.[name] === b?.[name]);
    }

    /** Whether an option is on or off, rather than a pick among several: it
     *  takes two values, its default being off. */
    static isToggle(option: ToolOption): boolean {
        return option.choices.length === 2;
    }

    /** What a toggle is when on: the value that is not its default. */
    static on(option: ToolOption): ToolChoice {
        return (
            option.choices.find((choice) => choice.value !== option.default) ?? option.choices[0]
        );
    }

    /** The choice an option is at for `value`, or at its default. */
    static choice(option: ToolOption, value: string | undefined): ToolChoice | undefined {
        return (
            option.choices.find((choice) => choice.value === value) ??
            option.choices.find((choice) => choice.value === option.default)
        );
    }
}
