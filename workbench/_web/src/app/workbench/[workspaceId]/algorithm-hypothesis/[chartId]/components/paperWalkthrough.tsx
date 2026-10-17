import type {
    AlgorithmDefinition,
    AlgorithmGrid,
    AlgorithmHypothesisMode,
} from "@/types/algorithmHypothesis";
import { EXAMPLE_PROMPTS, tokenizeAbstract } from "@/lib/algorithmHypothesis/grids";
import { EXAMPLE_NAMES, type ExampleKind } from "@/lib/algorithmHypothesis/presets";
import { ColorSwatch } from "./glyphs";
import type { InterventionState } from "./InterventionView";
import type { SweepState } from "./SweepView";
import type { WalkthroughStep } from "./Walkthrough";

/**
 * The paper demo (P6): a walkthrough of Gur-Arieh, Geva & Geiger (2025) on an
 * abstract grid with the Figure 1 inputs. It loads the positional, lexical,
 * reflexive and mixed algorithms one by one, each as its own algorithm, then
 * intervenes on them. Each step can be done by hand or with its button; a step
 * is checked once its state is in place.
 */

export const WALKTHROUGH_GRID: AlgorithmGrid = { kind: "abstract", layers: 8 };
/** Bumped when the steps or algorithms change, so saved progress restarts. */
export const WALKTHROUGH_VERSION = 2;
export const WALKTHROUGH_TARGET = EXAMPLE_PROMPTS[0].text; // … What does Tim love?
const SOURCE = EXAMPLE_PROMPTS[1].text; // … What does Ann love?
const LAST = tokenizeAbstract(WALKTHROUGH_TARGET).length - 1;

/** Where a step leaves the tool, on one of the walkthrough's algorithms. */
export interface WalkthroughGoal {
    /** A variable to open in the variable panel (Edit). */
    variable?: string;
    mode?: AlgorithmHypothesisMode;
    intervention?: InterventionState;
    sweep?: SweepState;
}

interface PaperWalkthroughContext {
    /** The walkthrough algorithm open now, if any. */
    current: ExampleKind | null;
    definition: AlgorithmDefinition;
    /** The variable open in the variable panel. */
    openVariable: string | null;
    mode: AlgorithmHypothesisMode;
    versionState: "draft" | "saved" | "changed";
    problemCount: number;
    intervention: InterventionState | null;
    sweep: SweepState | null;
    /** Opens (creating it the first time) one of the walkthrough's algorithms. */
    go: (kind: ExampleKind, goal?: WalkthroughGoal) => void;
    save: () => void;
    close: () => void;
}

const Mono = ({ children }: { children: React.ReactNode }) => (
    <span className="font-mono text-xs">{children}</span>
);

const COLOR: Record<Exclude<ExampleKind, "mixed">, string> = {
    positional: "indigo",
    lexical: "emerald",
    reflexive: "amber",
};

/** "indigo", with a swatch. */
const Color = ({ kind }: { kind: Exclude<ExampleKind, "mixed"> }) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <ColorSwatch color={COLOR[kind]} className="size-2.5" />
        {COLOR[kind]}
    </span>
);

export function paperWalkthroughSteps(c: PaperWalkthroughContext): WalkthroughStep[] {
    const on = (kind: ExampleKind) => c.current === kind;
    const layerOf = (kind: ExampleKind, id: string, fallback: number) =>
        (on(kind) ? c.definition.variables.find((v) => v.id === id)?.cell.layer : null) ?? fallback;
    const pLayer = layerOf("positional", "P", 5);
    const answerLayer = layerOf("positional", "answer", 7);
    const qLayer = layerOf("reflexive", "q_ptr", 3);
    const mixedAnswersLayer = layerOf("mixed", "pos_answer", 6);
    const at = (layer: number) => ({
        sourceLayer: layer,
        sourceToken: LAST,
        targetLayer: layer,
        targetToken: LAST,
    });
    const intervention = (layer: number | null): InterventionState => ({
        source: SOURCE,
        target: WALKTHROUGH_TARGET,
        spec: layer === null ? null : at(layer),
    });
    const intervenedAt = (layer: number) => {
        const s = c.intervention?.spec;
        return (
            on("positional") &&
            c.mode === "intervene" &&
            c.intervention?.source === SOURCE &&
            c.intervention.target === WALKTHROUGH_TARGET &&
            s?.sourceLayer === layer &&
            s.targetLayer === layer &&
            s.sourceToken === LAST &&
            s.targetToken === LAST
        );
    };
    const sweeping = (full: boolean) =>
        on("positional") &&
        c.mode === "sweep" &&
        c.sweep?.source === SOURCE &&
        c.sweep.target === WALKTHROUGH_TARGET &&
        c.sweep.full === full &&
        (full || c.sweep.token === LAST);
    const sweep = (full: boolean): SweepState => ({
        source: SOURCE,
        target: WALKTHROUGH_TARGET,
        token: LAST,
        full,
    });

    /** Loads the algorithm, then saves it: the saved ones are compared later. */
    const load = (kind: Exclude<ExampleKind, "mixed">) => ({
        action: !on(kind)
            ? { label: `Load the ${kind} algorithm`, run: () => c.go(kind) }
            : {
                  label: `Save ${EXAMPLE_NAMES[kind]}`,
                  run: c.save,
                  disabled:
                      c.versionState === "saved"
                          ? "Saved."
                          : c.problemCount
                            ? "Fix the problems in the Algorithm panel first."
                            : undefined,
              },
        done: on(kind) && c.versionState === "saved",
    });
    /** Opens a variable of a walkthrough algorithm in the variable panel. */
    const open = (kind: ExampleKind, id: string) => ({
        action: { label: `Open ${id}`, run: () => c.go(kind, { variable: id }) },
        done: on(kind) && c.openVariable === id,
    });

    return [
        {
            id: "load-positional",
            title: "Load the positional algorithm",
            body: (
                <>
                    <p>
                        Gur-Arieh, Geva &amp; Geiger (2025) ask how a model answers{" "}
                        <em>What does Tim love?</em> after “Ann loves ale, Joe loves jam, Pete loves
                        pie, Tim loves tea”. This walkthrough builds their three algorithms on an
                        abstract 8-layer grid, then intervenes on them.
                    </p>
                    <p>
                        Each opens as its own algorithm, so yours stay as they are. <b>Save</b> each
                        one once it loads: Intervene and Sweep compare saved algorithms.
                    </p>
                    <p>
                        Each algorithm&apos;s own variables get its color, here{" "}
                        <Color kind="positional" />; variables the algorithms share stay black.
                    </p>
                </>
            ),
            ...load("positional"),
        },
        {
            id: "open-pos1",
            title: "Position ID",
            body: (
                <>
                    <p>
                        Click <Mono>pos1</Mono>, the lowest variable on the left, above Ann.
                    </p>
                    <p>
                        The names are the algorithm&apos;s <b>special tokens</b> (underlined).
                        Position ID&apos;s default numbers them in order of first appearance and
                        stores position ID : token, so <Mono>pos1 = 1:Ann</Mono>. A name mentioned
                        again gets its first mention&apos;s ID: the question&apos;s Tim is{" "}
                        <Mono>q_pos = 4:Tim</Mono>, like the first Tim. The panel shows the code;
                        make it a custom function to try another numbering.
                    </p>
                </>
            ),
            ...open("positional", "pos1"),
        },
        {
            id: "open-positional-answer",
            title: "Retrieve",
            body: (
                <>
                    <p>
                        Click <Mono>answer</Mono>, tea, in the last column.
                    </p>
                    <p>
                        Retrieve works like attention: it matches a key against key : value pairs
                        and reads the value of the first match. The key is <Mono>P = 4</Mono>, the
                        question&apos;s position ID carried to the last token. The pairs bind each
                        entity to its name&apos;s position ID, <Mono>bind4 = 4:tea</Mono>, so the
                        answer is tea.
                    </p>
                </>
            ),
            ...open("positional", "answer"),
        },
        {
            id: "load-lexical",
            title: "Load the lexical algorithm",
            body: (
                <>
                    <p>
                        The lexical algorithm binds each entity to the name itself, and the
                        question&apos;s Tim retrieves it. Its own variables are{" "}
                        <Color kind="lexical" />.
                    </p>
                    <p>Save it once it loads.</p>
                </>
            ),
            ...load("lexical"),
        },
        {
            id: "open-bind1",
            title: "Lexical binding",
            body: (
                <>
                    <p>
                        Click <Mono>bind1</Mono>, Ann : ale, above ale.
                    </p>
                    <p>
                        Pair binds ale to the token Ann, not to Ann&apos;s position ID. The bindings
                        are black because the reflexive algorithm uses the same ones.
                    </p>
                </>
            ),
            ...open("lexical", "bind1"),
        },
        {
            id: "open-lexical-answer",
            title: "The same Retrieve",
            body: (
                <>
                    <p>
                        Click <Mono>answer</Mono> in the last column again.
                    </p>
                    <p>
                        It&apos;s the same Retrieve as in the positional algorithm, over different
                        bindings: the key is <Mono>L = Tim</Mono>, copied from the question, and it
                        matches <Mono>bind4 = Tim:tea</Mono>.
                    </p>
                </>
            ),
            ...open("lexical", "answer"),
        },
        {
            id: "load-reflexive",
            title: "Load the reflexive algorithm",
            body: (
                <>
                    <p>
                        The reflexive algorithm uses the lexical bindings but fetches the answer
                        entity earlier and carries a pointer to it. Its own variables are{" "}
                        <Color kind="reflexive" />.
                    </p>
                    <p>Save it once it loads.</p>
                </>
            ),
            ...load("reflexive"),
        },
        {
            id: "open-q_ptr",
            title: "The answer, fetched early",
            body: (
                <>
                    <p>
                        Click <Mono>q_ptr</Mono>, above the repeated Tim in the question.
                    </p>
                    <p>
                        It retrieves tea already at L{qLayer}, at the question&apos;s Tim.{" "}
                        <Mono>R</Mono> copies it to the last token, and <Mono>answer</Mono>{" "}
                        dereferences it: Retrieve with match = value finds the binding whose value
                        is tea, so it only works if tea is in context.
                    </p>
                </>
            ),
            ...open("reflexive", "q_ptr"),
        },
        {
            id: "load-mixed",
            title: "Load the mixed algorithm",
            body: (
                <>
                    <p>
                        Mixed is the union of the three: every variable of each, unchanged, so their
                        colors together are this one&apos;s (the positional bindings are renamed{" "}
                        <Mono>pos_bind</Mono>). The last token now stores <Mono>P</Mono>,{" "}
                        <Mono>L</Mono> and <Mono>R</Mono>, one for each algorithm, and at L
                        {mixedAnswersLayer} each algorithm&apos;s answer.
                    </p>
                    <p>
                        <Mono>answer</Mono> combines the three answers linearly, with equal weights
                        (an illustration, not the paper&apos;s fit; change them under Weights). Here
                        all three predict tea.
                    </p>
                    <p>
                        Don&apos;t save this one, so the next steps compare the three on their own.
                    </p>
                </>
            ),
            action: { label: "Load the mixed algorithm", run: () => c.go("mixed") },
            done: on("mixed"),
        },
        {
            id: "back-to-positional",
            title: "Back to positional, in Intervene",
            body: (
                <>
                    <p>
                        Intervene runs an interchange intervention: drag a cell of the <b>source</b>{" "}
                        grid onto the <b>target</b> grid, and the source&apos;s variables in that
                        cell replace the target&apos;s.
                    </p>
                    <p>
                        The source asks about Ann (“Joe loves ale, Ann loves pie, …”); the target
                        asks about Tim. The summary runs the intervention on every saved algorithm,
                        so lexical and reflexive appear next to positional.
                    </p>
                </>
            ),
            action: {
                label: "Open positional in Intervene",
                run: () =>
                    c.go("positional", { mode: "intervene", intervention: intervention(null) }),
            },
            done: on("positional") && c.mode === "intervene",
        },
        {
            id: "intervene-P",
            title: "Intervene on the position ID",
            body: (
                <>
                    <p>
                        Drag the last token&apos;s cell at L{pLayer}, where <Mono>P</Mono> sits,
                        from the source onto the target. Each algorithm keeps a different variable
                        there, so each predicts a different <b>counterfactual</b> output:
                    </p>
                    <ul className="list-disc pl-5">
                        <li>
                            Positional: Ann is the source&apos;s 2nd name, so P = 2 retrieves the
                            target&apos;s 2nd entity, <b>jam</b>.
                        </li>
                        <li>
                            Lexical: L = Ann retrieves Ann&apos;s entity in the target, <b>ale</b>.
                        </li>
                        <li>
                            Reflexive: R = pie, which the target has, so <b>pie</b>.
                        </li>
                    </ul>
                </>
            ),
            action: {
                label: `Intervene at L${pLayer}`,
                run: () =>
                    c.go("positional", {
                        mode: "intervene",
                        intervention: intervention(pLayer),
                    }),
            },
            done: intervenedAt(pLayer),
        },
        {
            id: "intervene-answer",
            title: "Intervene on the answer",
            body: (
                <p>
                    Now the last token at L{answerLayer}, where <Mono>answer</Mono> holds tea. Every
                    algorithm takes the source&apos;s answer, <b>pie</b>, so here they agree. The
                    reflexive prediction at L{pLayer} was pie too: the paper tells a pointer from
                    the answer with a source whose answer the target never mentions.
                </p>
            ),
            action: {
                label: `Intervene at L${answerLayer}`,
                run: () =>
                    c.go("positional", {
                        mode: "intervene",
                        intervention: intervention(answerLayer),
                    }),
            },
            done: intervenedAt(answerLayer),
        },
        {
            id: "sweep-last",
            title: "Sweep the last token",
            body: (
                <p>
                    A sweep runs the intervention at every layer of one token. On the last token the
                    algorithms disagree at L{pLayer}–L{answerLayer - 1}, where P, L and R sit, and
                    agree from L{answerLayer}, where the answer itself is swapped. Below L{pLayer}{" "}
                    the last token holds no variable yet, so nothing changes.
                </p>
            ),
            action: {
                label: "Sweep the last token",
                run: () => c.go("positional", { mode: "sweep", sweep: sweep(false) }),
            },
            done: sweeping(false),
        },
        {
            id: "sweep-full",
            title: "Every position",
            body: (
                <p>
                    <b>Full grid</b> sweeps every token at every layer: one map per algorithm.
                    Besides the last token, they disagree at the question&apos;s Tim, where{" "}
                    <Mono>q_pos</Mono>, <Mono>q_key</Mono> and <Mono>q_ptr</Mono> sit. Only the
                    positional algorithm changes at Ann and Joe, which the source swaps:{" "}
                    <Mono>q_pos</Mono> reads the names before Tim to number him.
                </p>
            ),
            action: {
                label: "Sweep the full grid",
                run: () => c.go("positional", { mode: "sweep", sweep: sweep(true) }),
            },
            done: sweeping(true),
        },
        {
            id: "finish",
            title: "Your turn",
            body: (
                <>
                    <p>
                        You built the paper&apos;s three algorithms and found interventions that
                        tell them apart. Some things to try:
                    </p>
                    <ul className="list-disc pl-5">
                        <li>
                            Open Mixed (Open, Drafts) and change <Mono>answer</Mono>&apos;s weights,
                            then save it to compare it too.
                        </li>
                        <li>
                            Move P earlier or later and sweep again: the disagreement follows its
                            span.
                        </li>
                        <li>Download an algorithm to share it; Open, From file reads it back.</li>
                        <li>Write a custom Python function, save it, and compare.</li>
                    </ul>
                </>
            ),
            action: { label: "Finish", run: c.close },
            done: false,
        },
    ];
}
