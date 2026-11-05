import { describe, expect, test } from "bun:test";

import { ErrorRedaction } from "../errorRedaction";

const QUERY_ERROR =
    'Failed query: update "configs" set "data" = $1 where "configs"."id" = $2\nparams: {"prompt":"The Eiffel Tower is in"},3f1c';

describe("ErrorRedaction.redacted", () => {
    test("cuts a query error's bound values and keeps its SQL", () => {
        const error = new Error(QUERY_ERROR);
        error.name = "DrizzleQueryError";
        const clean = ErrorRedaction.redacted(error) as Error;

        expect(clean.message).toBe(
            'Failed query: update "configs" set "data" = $1 where "configs"."id" = $2',
        );
        expect(clean.message).not.toContain("Eiffel");
        expect(clean.name).toBe("DrizzleQueryError");
        expect(clean.stack ?? "").not.toContain("Eiffel");
    });

    test("cuts them from a cause too", () => {
        const error = new Error("Couldn't save the chart", { cause: new Error(QUERY_ERROR) });
        const clean = ErrorRedaction.redacted(error) as Error;

        expect(clean.message).toBe("Couldn't save the chart");
        expect((clean.cause as Error).message).not.toContain("params:");
    });

    test("returns other errors and non-errors unchanged", () => {
        const error = new Error("Timed out waiting for job 1234");
        expect(ErrorRedaction.redacted(error)).toBe(error);
        expect(ErrorRedaction.redacted("a string")).toBe("a string");
        expect(ErrorRedaction.redacted(null)).toBe(null);
    });
});
