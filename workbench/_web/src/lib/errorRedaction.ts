/**
 * Errors trimmed of user data before they're reported, client and server.
 *
 * A Drizzle query error's message ends in the query's bound values (`Failed
 * query: <sql>\nparams: <values>`), which can be a prompt, a report or a name;
 * the SQL itself carries placeholders only, so the values are cut, from the
 * error and from its causes.
 */
export class ErrorRedaction {
    private static readonly PARAMS = "\nparams:";
    private static readonly MAX_CAUSES = 5;

    /** `error`, or a copy of it with bound query values cut from its message and its causes'. */
    static redacted(error: unknown, depth = 0): unknown {
        if (!(error instanceof Error) || depth > ErrorRedaction.MAX_CAUSES) return error;
        const cause = ErrorRedaction.redacted(error.cause, depth + 1);
        const cut = error.message.indexOf(ErrorRedaction.PARAMS);
        if (cut === -1 && cause === error.cause) return error;

        const message = cut === -1 ? error.message : error.message.slice(0, cut);
        const clean = new Error(message, { cause });
        clean.name = error.name;
        clean.stack = error.stack?.replace(error.message, message);
        return clean;
    }
}
