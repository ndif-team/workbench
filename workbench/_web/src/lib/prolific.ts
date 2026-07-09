/**
 * Prolific study identifiers, appended to the workshop join link as query
 * params when a participant arrives from Prolific — e.g.
 * `/w/{slug}?PROLIFIC_PID=…&STUDY_ID=…&SESSION_ID=…`. Captured onto the
 * participant's workspace row so their runs can be matched back to the study
 * for later analysis. Every field is optional: we retain whatever Prolific
 * sends and store nothing when it sends none.
 */
export type ProlificParams = {
    prolificPid?: string;
    studyId?: string;
    sessionId?: string;
};

// The shape Next.js hands a page's `searchParams` (and what URLSearchParams
// entries collapse to): each key is absent, a single value, or repeated.
type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => {
    const v = Array.isArray(value) ? value[0] : value;
    const trimmed = v?.trim();
    return trimmed ? trimmed : undefined;
};

/**
 * Pulls Prolific identifiers out of a page's query params. Prolific sends the
 * canonical UPPER_CASE keys; we accept lower_case defensively. Returns null
 * when none are present so callers store nothing rather than an empty object.
 */
export function parseProlificParams(searchParams: RawSearchParams): ProlificParams | null {
    const prolificPid = first(searchParams.PROLIFIC_PID ?? searchParams.prolific_pid);
    const studyId = first(searchParams.STUDY_ID ?? searchParams.study_id);
    const sessionId = first(searchParams.SESSION_ID ?? searchParams.session_id);

    const params: ProlificParams = {};
    if (prolificPid) params.prolificPid = prolificPid;
    if (studyId) params.studyId = studyId;
    if (sessionId) params.sessionId = sessionId;

    return Object.keys(params).length > 0 ? params : null;
}
