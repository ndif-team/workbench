import { TUTORIAL_STEP_IDS } from "./prolificSteps";
import type { TutorialContent } from "@/types/tutorial-content";

/**
 * Seed content for the demo Prolific Patch Lens tutorial. This is the *seed
 * input* only — at runtime the tutorial is read from the `tutorials` DB table
 * (see lib/queries/tutorialContentDb.ts). The seed script inserts this as one
 * "Prolific Patch Lens (demo)" row; admins then edit copy in the workshop UI.
 *
 * Embedded checks are auto-scored against the participant's OWN run result
 * (greedy decoding is deterministic), so they need no answer keys and stay
 * correct across models. They are log-only and never gate progress.
 *
 * Progression is data-driven: most lens units complete on any run
 * (`successPredicate: always`); u3 completes only when the model is coaxed off the
 * true sum (`topTokenNotEqual: "10"`); the patch unit completes on an applied
 * intervention; explore/challenge never auto-complete.
 *
 * This is the post-pilot revision of the first Prolific pull (27 submissions, 8
 * Workbench entrants). What it changed and why:
 *  - **A modal orientation** (`welcome`), replacing a standing paragraph above the
 *    prompt boxes that nobody read. The arm's worst SUS item by a wide margin was
 *    "I needed to learn a lot of things before I could get going"; its best was
 *    "easy to use". Steep entry onto a usable tool, so the entry is now its own
 *    surface, followed by a hands-on walkthrough (`orientationTour.ts`).
 *  - **`why` on every unit.** Participants completed steps and asked what they
 *    were for. `concept` says what just happened; `why` says where it shows up.
 *  - **The old u0 split in two.** It packed five ideas into ~120 words before the
 *    participant had done anything: `u0-orientation` is now one action and one
 *    idea, and append-and-rerun became `u0b-append`.
 *  - **`u4a-compare` before the patch unit** — run the pair and read both
 *    heatmaps, no dragging. The patch unit had the lowest completion of any (0.50)
 *    and carries the study's differentiation claim.
 *  - **New `u1b-inside`** ("How a prediction is made"), the first step that treats
 *    the grid as more than its bottom-right cell: click a mid-grid cell and read
 *    the row / column / cone. Without it, "why patch *there*" has no grounding by
 *    the time the patch step asks the question.
 *  - **`tryYourOwn` on most units.** The prompt bank is the path of least
 *    resistance from step 1 to the end, and a participant who only ever clicks it
 *    never finds out the tool answers questions they brought themselves.
 *  - **`u3-patterns` starts from bare `5+5=`.** Its first bank entry used to be
 *    the already-poisoned prompt, so the one click that sets the step up also
 *    skipped the before-picture the whole point rests on.
 *  - **Both ends of the patch drag are spotlit.** Hint copy naming cells in prose
 *    ("the 'um' cell at the end of 'Colosseum'") is a sign the affordance isn't
 *    discoverable. Verified against the Llama-3.1 tokenizer: with BOS at index 0,
 *    position 5 is " Tower" in the source and "um" in the target.
 */

export const PROLIFIC_TUTORIAL_SLUG = "prolific-patch-lens-demo";
export const PROLIFIC_TUTORIAL_NAME = "Prolific Patch Lens (demo)";

const EIFFEL = "The Eiffel Tower is in the city of";
const COLOSSEUM = "The Colosseum is in the city of";

/**
 * The cell to drag from, and the cell to drop on. Both are position 5 (BOS at 0):
 * " Tower" in the source, "um" — the end of "Colosseum" — in the target. Layer 20
 * is a middle layer of the 32-layer intro model, late enough for the landmark to
 * be resolved and early enough for the swap to still change the output.
 */
const PATCH_DRAG = [
    { grid: "source" as const, layer: 20, position: 5 },
    { grid: "target" as const, layer: 20, position: 5 },
];

export const PROLIFIC_TUTORIAL_SEED: TutorialContent = {
    version: 1,
    welcome: {
        tourCta: "Show me around",
        slides: [
            {
                title: "You're about to look inside a language model",
                body: [
                    "The same kind of model behind ChatGPT, autocomplete, and coding assistants — but with nothing built around it. No chat window, no personality, no safety layer. Just the model.",
                    "It does exactly one thing: **given some text, guess the next word.** That's it. Everything else those products do is that one guess, run over and over.",
                    "You'll spend about 20 minutes making it guess, watching how it gets there, and — at the end — reaching in and changing its mind.",
                ].join("\n\n"),
            },
            {
                title: "What the grid shows you",
                body: [
                    "The model doesn't guess in one step. Your text passes through dozens of processing **layers**, and the guess changes as it goes.",
                    "Patch Lens stops the model at every layer and asks: *what would you say next, if you had to answer right now?* The answers fill a grid:",
                    "- **Rows** are the **tokens** of your text, in order. Not quite words: the model reads in chunks, and long words get split across several.\n- **Columns** are layers — earliest on the left, last on the right.\n- **Each cell** is what the model would have said if it stopped there.",
                    "The **bottom-right cell** — last word, last layer — is the model's real answer. Every question in this tutorial is about that cell.",
                ].join("\n\n"),
            },
            {
                title: "Six words you'll need",
                body: "These come up constantly. You don't have to memorise them — the book icon at the top of the tutorial has all of them, on every step.",
                cards: [
                    {
                        term: "Token",
                        definition:
                            "One chunk of text. Usually a whole word, sometimes part of one, sometimes just a space or a comma.",
                    },
                    {
                        term: "Position",
                        definition:
                            "Where a token sits in your text. One row of the grid per position.",
                    },
                    {
                        term: "Layer",
                        definition:
                            "One step of the model's thinking. One column of the grid per layer.",
                    },
                    {
                        term: "Cell",
                        definition:
                            "One square: what the model would say next if it stopped at that layer, at that position.",
                    },
                    {
                        term: "Heatmap",
                        definition:
                            "The grid itself. Stronger colour means the model was more sure of that cell's guess.",
                    },
                    {
                        term: "Bottom-right cell",
                        definition:
                            "Last position, last layer — the model's actual answer. Read this one when a question asks what it predicted.",
                    },
                ],
            },
            {
                title: "How the tutorial works",
                body: [
                    "Ten short steps, in a column on the right. Each one gives you **one thing to do**, says **why it matters**, nudges you to try a prompt of your own, and asks what you noticed.",
                    "- Stuck? Every step has hints, and the last one just does it for you.\n- Lost a word? The book icon at the top of the column is a glossary.\n- Nothing here is graded, and there are no wrong answers in the notes.",
                    "Next: a quick walk around the screen, running the first prompt together.",
                ].join("\n\n"),
            },
        ],
    },
    units: [
        {
            id: TUTORIAL_STEP_IDS.orientation,
            kind: "lens",
            title: "Read one prediction",
            task: "Click Run Patch Lens. Then find the bottom-right cell of the heatmap, at the last layer and the last position. That one cell is the model's prediction for what comes next.",
            concept:
                "The model predicts one token at a time, and nothing more. A token is usually a whole word, sometimes a piece of one or a bit of punctuation. Everything in the heatmap is the model working its way toward that single next token, layer by layer, left to right.",
            why: "Every AI writing tool you have used is doing this one step, over and over — autocomplete, a chat assistant, a coding assistant. If you can read one prediction, you can read all of them.",
            tryYourOwn:
                "Before moving on, put a sentence of your own in the box — anything that stops right before its answer — and run it. Seeing the tool answer a question you brought is the point of it.",
            prompts: [EIFFEL],
            hints: [
                {
                    stage: 1,
                    text: "Click Run Patch Lens, then look at the last row: that's the model working on the word that comes after your prompt.",
                },
                {
                    stage: 2,
                    text: "The rightmost column is the final layer. Read the bottom-right cell: that's the model's actual next-token guess.",
                },
                {
                    stage: 3,
                    text: "Nothing showing up? Load the starter prompt into the 'source' box, then click Run Patch Lens. The heatmap only appears after a run.",
                    insertPrompt: EIFFEL,
                },
            ],
            check: {
                kind: "topToken",
                question:
                    "Read the bottom-right cell of the heatmap you just ran. What token is in it?",
            },
            answerPlaceholder: "The token in the bottom-right cell…",
            observationPrompt:
                "What did the model predict? Did anything about the heatmap surprise you?",
            observationPlaceholder: "What the model predicted, and anything that surprised you…",
            faqs: [
                {
                    q: "What do these words mean?",
                    a: "Token: one chunk of text the model works in, usually a whole word, sometimes a piece of one or a bit of punctuation. Layer: one processing stage inside the model; the heatmap's columns run from the first layer on the left to the last on the right. Position: one token of your prompt; the heatmap's rows. Cell: one layer's best guess at one position. The bottom-right cell, at the last layer and last position, is the model's real answer.",
                },
                {
                    q: "It predicted a blank line, a space, or a comma. Is it broken?",
                    a: "No. That means the model thinks the sentence is already finished, so the most likely next thing is a break or a punctuation mark. It is a real prediction, not an error. If you want a word instead, end your prompt right before the answer, e.g. '… is in the city of'.",
                },
                {
                    q: "Why do the earlier layers show different words?",
                    a: "The model builds its answer up across the layers. Earlier columns often show rough or unrelated guesses, and the prediction usually settles into place toward the right. The far-right column is the one the model actually uses.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.append,
            kind: "lens",
            title: "Build up an answer",
            task: "Take the token you just read and add it to the end of the prompt, so the prompt now ends with the model's own prediction. Run again. Read the new bottom-right cell. Do it once or twice more if you like, and watch a sentence build up.",
            concept:
                "One run gives you one token. Append that token to your prompt, run again, and you get the next one. Repeat, and a whole answer builds up a token at a time. Nothing plans the sentence in advance: each token is chosen with only the text before it in view.",
            why: "This is the whole trick behind AI-written text — there is no draft and no plan, just this loop. It is also why these tools can contradict themselves halfway through a paragraph: nothing was ever committed to.",
            tryYourOwn:
                "Try the loop on a sentence of your own. Start something that trails off, keep appending whatever the model predicts, and see where it has taken you after five or six rounds.",
            prompts: [EIFFEL],
            hints: [
                {
                    stage: 1,
                    text: "Click into the 'source' box, type the predicted token at the end of the prompt, then click Run Patch Lens again.",
                },
                {
                    stage: 2,
                    text: "Each run only ever gives you one more token. To grow the sentence you have to keep appending and re-running: that is the whole loop.",
                },
                {
                    stage: 3,
                    text: "Load this longer prompt, which is the starter prompt with the model's own prediction already added, and run it.",
                    insertPrompt: `${EIFFEL} Paris`,
                },
            ],
            check: {
                kind: "topToken",
                question:
                    "After adding the prediction to the end of your prompt and running again, what token is in the bottom-right cell now?",
            },
            answerPlaceholder: "The new token in the bottom-right cell…",
            observationPrompt:
                "What did the sentence turn into after a few rounds? Was each new token the one you expected?",
            observationPlaceholder:
                "How the sentence grew, and whether the tokens were what you expected…",
            faqs: [
                {
                    q: "So is this what ChatGPT does?",
                    a: "Yes, this loop is how chat assistants produce text: that word-by-word 'typing' you have probably seen is a model running exactly this. But a chat assistant is not the same thing as a model. It is a product built around one, with extra machinery for safety, memory and formatting. Here you are working with the model on its own, with nothing built around it.",
                },
                {
                    q: "Do I have to do this by hand every time?",
                    a: "Here, yes: this tool shows you one prediction at a time on purpose, so you can look inside a single step. A chat assistant runs the same loop for you, hundreds of times, and only shows you the finished text.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.whereAnswersComeFrom,
            kind: "lens",
            title: "Where answers come from",
            task: "Run one of these and read the bottom-right cell, the model's top next token. Then click that cell to open the side panel, and look at the runner-up ranked just below the top one.",
            concept:
                "The model didn't look that answer up. The top prediction is just the most likely next token from patterns in the 2023 training data, and the runner-up ranked just below shows the model was choosing among options, not retrieving one stored fact.",
            why: "The runner-up is why the same question can get a different answer twice. A model ranks candidates rather than looking one up, so how sure it is and whether it is right are two separate things.",
            tryYourOwn:
                "Before moving on, try a question of your own — one you know the answer to, and one you doubt the model knows. Compare the runner-ups: how far behind the top guess is it in each case?",
            prompts: [
                "The largest planet in the solar system is",
                "The tallest mountain in the world is Mount",
                "The best football player of all time is",
            ],
            hints: [
                {
                    stage: 1,
                    text: "Run the prompt, then click the bottom-right cell to open the top predictions panel.",
                },
                {
                    stage: 2,
                    text: "The side panel lists the top tokens by probability. The second row is the runner-up.",
                },
                {
                    stage: 3,
                    text: "Load this prompt and run it, then click the bottom-right cell to open the predictions panel. The second row is the runner-up.",
                    insertPrompt: "The largest planet in the solar system is",
                },
            ],
            check: {
                kind: "secondToken",
                question: "In the side panel, what token is ranked SECOND, just below the top one?",
            },
            answerPlaceholder: "The second-ranked token in the panel…",
            observationPrompt:
                "What was the top answer and its runner-up, and would a person have answered the same way? Looking across the layers, roughly where did the top answer first appear?",
            observationPlaceholder:
                "Top answer vs. runner-up, whether a person would agree, and roughly where the answer first appeared across the layers…",
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            // Reading the grid, before anything asks them to intervene in it. Up to
            // here every question has been about the bottom-right cell; this is the
            // first step that treats the rest of the grid as meaningful, which is
            // what makes "why patch *there*" answerable two steps later.
            id: TUTORIAL_STEP_IDS.howAPredictionIsMade,
            kind: "lens",
            title: "How a prediction is made",
            task: "Run the prompt, then click the ringed cell in the middle of the grid — not the bottom-right one this time. The side panel shows which position and layer you picked, and its ranked guesses with their percentages. Now look at the grid itself: a row and a column light up through your cell, and a shaded region spreads out behind it.",
            concept:
                "Your cell sits in a grid the model filled in one column at a time. The lit column is everything that layer worked out, at every position at once. The lit row is this one position's guess changing as it goes deeper. The shaded region is the cone: the only cells whose results were available when yours was computed — strictly earlier layers, at this position or earlier ones. The model can look back but never forward, which is why the cone opens to the left.",
            why: "A prediction is not one lookup — it is a value assembled across layers, from a limited set of earlier values. That is what makes the next steps possible: if a piece of information is built somewhere specific, you can find where by changing it and watching what breaks.",
            tryYourOwn:
                "Try your own sentence and click a middle cell in it. Does its answer settle into place earlier or later across the layers than this one did? Easy questions often settle sooner.",
            prompts: [COLOSSEUM],
            // Ringing a mid-grid cell does the choosing for them, deliberately: the
            // point is what the cone shows, not which cell they land on. It also
            // guarantees a middle layer column is rendered — auto-fit downsamples
            // layers to the column width, so "click a middle cell" is not always
            // possible unless a spotlight forces one to exist.
            spotlights: [{ grid: "source", layer: 16, position: 5 }],
            hints: [
                {
                    stage: 1,
                    text: "Click the ringed cell — the pulsing one partway across the grid. Any middle cell works; that one is just a good example.",
                },
                {
                    stage: 2,
                    text: "The arrows are the flow. A chevron pointing right hands this position's work to the next layer; a chevron pointing down hands it to the next token. Open 'About this view' at the bottom of the side panel for the row, column and cone in the widget's own words.",
                },
                {
                    stage: 3,
                    text: "Load this prompt and run it, then click the ringed cell. Read the percentages in the panel, then find the shaded cone behind your cell — it stops at your layer and never reaches to the right of it.",
                    insertPrompt: COLOSSEUM,
                    spotlights: [{ grid: "source", layer: 16, position: 5 }],
                },
            ],
            // A conceptual question, so a conceptual instrument: there is no token to
            // read off here, and a free-text answer would be scored against the
            // bottom-right cell — the one cell this step is asking them to ignore.
            check: {
                kind: "choice",
                question:
                    "Which cells could have fed into the one you clicked, according to the cone?",
                options: [
                    "Earlier layers, at the same position or earlier ones",
                    "Every other cell in the grid",
                    "Only the cell immediately to its left",
                    "Later layers, at later positions",
                ],
                correctIndex: 0,
            },
            observationPrompt:
                "What was the model's top guess at the cell you clicked, and how sure was it? Was that guess anything like the final answer?",
            observationPlaceholder:
                "The guess at that middle cell, how sure it was, and how it compared to the final answer…",
            faqs: [
                {
                    q: "Why is the top guess in the middle of the grid nonsense?",
                    a: "Because it isn't finished. A middle cell is the model's best guess if it had to stop and answer right there, with only part of its computation done. Early guesses are often unrelated words; the answer usually settles into place toward the right. Watching where it settles is the interesting part.",
                },
                {
                    q: "Why does the cone only open to the left?",
                    a: "Two reasons stacked. A layer can only use what earlier layers produced, so nothing to the right of your cell was available. And each position can only see itself and the text before it — that's the causal mask, and it's why the model can't peek at words that haven't happened yet.",
                },
                {
                    q: "What are the small arrows between the cells?",
                    a: "The path the computation takes. A chevron pointing right passes this position's state to the next layer. A chevron pointing down passes it along to the next token position. Together they're the two directions information can travel in the grid.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.whatModelKnows,
            kind: "lens",
            title: "What the model knows",
            task: "Run one of these. The model will confidently fill in a favorite, but you never told it one. Notice that it invents a detail rather than leaving it blank. That made-up answer is the whole point.",
            concept:
                "Right now, the model knows only two things: what Meta pre-trained it on back in 2023, and what's written in this prompt. Nothing else.",
            why: "This is where invented citations and made-up policy details come from. With nothing to recall, the model fills the gap with something plausible — and it looks exactly like an answer it does know. Knowing where its knowledge stops is how you know when to check.",
            tryYourOwn:
                "Try the other half of the experiment yourself: write a prompt that states your favourite colour up front and then asks for it. Compare that with asking cold — same question, and only one of them has anything to recall.",
            prompts: [
                "Earlier I told you my favorite color. My favorite color is",
                "Earlier I told you my favorite food. My favorite food is",
            ],
            hints: [
                {
                    stage: 1,
                    text: "There is no 'earlier': the model has nothing to recall, so it fills the blank with a plausible guess. Watch what it invents.",
                },
                {
                    stage: 2,
                    text: "Now try a prompt that states your favorite color up front, then asks for it again. The model can only use what's written here, so this time it has something to recall.",
                },
                {
                    stage: 3,
                    text: "Load this prompt and run it. The model has no favorite color to recall, so watch the detail it makes up.",
                    insertPrompt: "Earlier I told you my favorite color. My favorite color is",
                },
            ],
            check: {
                kind: "topToken",
                question:
                    "What did the model invent for the 'remembered' detail it was never actually told?",
            },
            answerPlaceholder: "The detail the model made up…",
            observationPrompt: "The model had no way to know the answer. What did it do instead?",
            observationPlaceholder: "What the model did when it had nothing to recall…",
            faqs: [
                {
                    q: "Does it remember me between prompts?",
                    a: "No. The model sees only the text in the current prompt. Nothing about you or past prompts carries over.",
                },
                {
                    q: "Does it keep learning from what I type?",
                    a: "No. Its weights were frozen after 2023 pre-training. It 'graduated' and no longer learns; your prompt only fills its short-term context.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.patternsBeatFacts,
            kind: "lens",
            title: "Patterns beat facts",
            // The bare sum is the first bank entry on purpose: clicking it runs it,
            // which is the before-picture the rest of the step is measured against.
            // The old first entry was the already-poisoned prompt, so the one click
            // that set the step up also skipped its point.
            task: "Start with just 5+5= and run it. The model answers 10 — it plainly knows the sum. Now add one wrong example line above the 5+5= line, like 4+4=9, and run again. Add another, like 3+3=7, and run. Keep adding lines that are wrong by the same amount, running after each, until the model answers 5+5 with something other than 10. Then use 'Start this step fresh' to clear the examples, and 5+5= is 10 again.",
            concept:
                "You didn't change how the model does math. Line by line, you filled its context with a pattern, and it followed that pattern instead of the real sum. Start fresh and the context is empty again, so 5+5 goes back to 10.",
            why: "This is the mechanism behind prompt injection and jailbreaks: whatever is in the context steers the answer, and it can beat a fact the model plainly knows. It is also why worked examples in a prompt are so effective — the same lever, pointed somewhere useful.",
            tryYourOwn:
                "Try your own version before moving on. Different numbers, a bigger offset, or a pattern that is not arithmetic at all. How few lines can you get away with, and does the model ever refuse to follow?",
            prompts: ["5+5=", "3+3=7\n4+4=9\n5+5=", "1+1=3\n2+2=5\n3+3=7\n5+5="],
            hints: [
                {
                    stage: 1,
                    text: "Run 5+5= on its own first, so you can see what the model says before you change anything. Then start adding wrong lines above it.",
                },
                {
                    stage: 2,
                    text: "Add the wrong lines one at a time above 5+5=, each off by the same amount (like 3+3=7), and run after each. Watch the 5+5 prediction change.",
                },
                {
                    stage: 3,
                    text: "Load these example lines and run. Each is wrong by the same amount, which pushes the model to answer 5+5 with something other than 10.",
                    insertPrompt: "3+3=7\n4+4=9\n5+5=",
                },
            ],
            check: {
                kind: "topToken",
                question:
                    "On your most recent run, with the wrong example lines in place, what does the model now predict for 5+5?",
            },
            answerPlaceholder: "The number the model predicts for 5+5 now…",
            observationPrompt:
                "How many wrong lines did it take before the model gave in? Looking across the layers, where did it commit to the pattern?",
            observationPlaceholder:
                "How many lines it took, and where across the layers it committed…",
            faqs: [
                {
                    q: "Is there a limit to how much it can read?",
                    a: "Yes. The model can only take in so much text at once: its context window. Anything past that limit falls out of view, so it can't use what doesn't fit.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "topTokenNotEqual", value: "10" } },
        },
        {
            id: TUTORIAL_STEP_IDS.compare,
            kind: "patch",
            task: "There are now two prompts: a 'source' box and a 'target' box, each with its own heatmap. Click 'Load both prompts and run' (or Run Patch Lens) to build both. Read the bottom-right cell of each one, and find the row in each heatmap that holds the landmark's name. Don't move anything yet.",
            title: "Two prompts, two heatmaps",
            concept:
                "Each prompt gets its own heatmap, and each reaches its own answer independently. The two are not connected yet. These two sentences are identical apart from the landmark, so the landmark is the only thing that can explain why one answers Paris and the other Rome — and the row holding that name is where the difference has to live. Finding that row in each grid is what makes the next step possible.",
            why: "Two prompts worded identically apart from one thing is the basic setup of an interpretability experiment. Hold everything else constant, and any difference you find has only one place it could have come from.",
            tryYourOwn:
                'Write your own pair — two sentences worded the same way with different answers, like "The opposite of hot is" and "The opposite of tall is". Run them and find where each answer settles.',
            prompts: [EIFFEL, COLOSSEUM],
            patchPair: { source: EIFFEL, target: COLOSSEUM },
            hints: [
                {
                    stage: 1,
                    text: "Click 'Load both prompts and run' once; both heatmaps are built from the same run. The source is the upper heatmap, the target the lower one.",
                },
                {
                    stage: 2,
                    text: "Each heatmap works the same way as before: rows are positions in that prompt, columns are layers, and the bottom-right cell is that prompt's own answer. The highlighted cells are the landmark rows — 'Tower' in the source and the end of 'Colosseum' in the target.",
                    spotlights: PATCH_DRAG,
                },
            ],
            observationPrompt:
                "What city did each prompt predict? Which row in each heatmap holds the landmark's name?",
            observationPlaceholder:
                "The two predicted cities, and where each landmark's name sits…",
            faqs: [
                {
                    q: "Why are there two prompts now?",
                    a: "Because the next step copies a piece of one prompt's internal state into the other. The 'source' is where the piece comes from; the 'target' is where it goes. This step is just about getting familiar with the two heatmaps before you move anything.",
                },
            ],
            progression: { on: "run", successPredicate: { kind: "always" } },
        },
        {
            id: TUTORIAL_STEP_IDS.moveAThought,
            kind: "patch",
            // The rings are authoritative, not the prose. Naming a column in the
            // task ("a middle column rather than the far-right one") reads as a
            // contradiction whenever the grid is narrow enough that the widget
            // downsamples layers and snaps the ring to the last column — which is
            // what happens with two heatmaps side by side at 1366px. The reasoning
            // moved into the FAQ below, where it informs rather than instructs.
            task: "Now move a piece of the source into the target. Two cells are ringed for you: one in the source heatmap on the row for 'Tower', one in the target on the row for the end of 'Colosseum'. Drag the source one onto the target one — same column, different prompt. Then read the target's bottom-right cell again.",
            title: "Move a thought",
            concept:
                "Here is what the drag actually does. At the cell you drag from, the source prompt's computation has a value — its half-finished state at that position and layer. Dropping it on the target overwrites the target's value at the same place, and then the target's computation carries on from there, through every layer to its right, as if that value had always been its own. Nothing else about the target changes. So if its final answer moves, the only thing that could have moved it is the value you copied — which means that value was carrying the answer. You did not tell the model about Paris; you moved the part of it that already knew.",
            why: "This is the real research technique — activation patching — and it is how a model gets audited rather than guessed at. Instead of reading the output and speculating, you intervene inside the computation and see what the output depends on.",
            tryYourOwn:
                "Before moving on, try it with a pair of your own — two sentences worded alike with different answers. Patch between them and hunt for the cell that flips the answer. It is often not the first one you try, and that is the actual experience of doing this research.",
            prompts: [EIFFEL, COLOSSEUM],
            patchPair: { source: EIFFEL, target: COLOSSEUM },
            // Ringed on arrival, not on a hint: the task text points at these two
            // cells, and the ring is also what makes the widget render layer 20 in a
            // narrow column (auto-fit would otherwise downsample it away).
            spotlights: PATCH_DRAG,
            hints: [
                {
                    // Both ends lit from the first rung. Naming the drop cell in
                    // prose ("the 'um' cell at the end of 'Colosseum'") is what made
                    // the drag undiscoverable — a hint that has to give coordinates
                    // is a hint about a missing affordance.
                    stage: 1,
                    text: "Run first if you haven't — you can't drag a cell until both heatmaps are showing. Two cells are now ringed: drag the one in the source heatmap onto the one in the target.",
                    spotlights: PATCH_DRAG,
                },
                {
                    stage: 2,
                    text: "Drag the ringed 'Tower' cell in the source onto the ringed cell at the end of 'Colosseum' in the target. Stay in the same column: same layer, different prompt.",
                    spotlights: PATCH_DRAG,
                },
                {
                    stage: 3,
                    text: "Load the pair and run, then drag the ringed source cell (layer 20, on 'Tower') onto the ringed target cell (layer 20, the end of 'Colosseum'). The Colosseum's predicted city flips to Paris.",
                    spotlights: PATCH_DRAG,
                    insertPrompt: EIFFEL,
                },
            ],
            check: {
                kind: "topToken",
                question:
                    "After the patch, read the TARGET heatmap's bottom-right cell. What city does it name now?",
            },
            answerPlaceholder: "The city the target predicts after the patch…",
            observationPrompt:
                "Which cell did you patch, and how did the target's prediction change?",
            observationPlaceholder: "The cell you patched and how the target's prediction changed…",
            faqs: [
                {
                    q: "Nothing happens when I drag. What am I doing wrong?",
                    a: "Three things have to be true: both heatmaps must already be built (click 'Load both prompts and run' first), you must start the drag from a cell in the SOURCE heatmap, and you must drop it on a cell in the TARGET at the same layer, meaning the same column.",
                },
                {
                    q: "Which column should I drag from?",
                    a: "A middle one, if you have middle ones to choose from. Middle layers are where the answer is still being assembled, so a swap there can still change the outcome; by the last column the answer is already fixed and a swap does little. If your grid is only showing two or three layer columns, the layers in between are hidden — click one of the amber bands between the columns to expand them, or widen the window.",
                },
                {
                    q: "Why does the layer I pick matter so much?",
                    a: "Because it decides how much of the computation is left to be affected. Patch too early and the model hasn't finished working out which landmark it's reading, so there's no answer in that value yet to copy. Patch too late and everything downstream is already decided — the cone from that cell barely reaches the output, so nothing changes. Somewhere in the middle the fact has been assembled but not yet used, and that's the window where a swap flips the answer. Finding that window IS the experiment; researchers sweep every layer one at a time and read off where the effect appears.",
                },
                {
                    q: "Why that token position, and not any other?",
                    a: "Because that's where the model has finished reading the landmark's name. 'Colosseum' is spelled across several tokens, and only at the last of them has the model seen the whole word — so that position is where 'which landmark this is' has been resolved. Patch a position before it and you catch the name half-read; patch a later position, like 'city', and the answer has already been passed along and the copy arrives too late to matter.",
                },
                {
                    q: "So does this prove where the fact is stored?",
                    a: "It's evidence, not proof, and that distinction is a real one in this field. A patch that changes the output tells you that value mattered for this pair of prompts. It doesn't tell you the fact is stored only there, or that the same cell matters for a different pair. Which is why the technique is used as a sweep across many layers, positions and prompt pairs, rather than a single dramatic drag.",
                },
            ],
            progression: { on: "patch" },
        },
        {
            id: TUTORIAL_STEP_IDS.explore,
            kind: "explore",
            title: "Explore",
            task: "Free exploration: try your own prompts. Phrase them so the answer is the very next word.",
            concept:
                "Phrase your prompt so the answer is the very next word. If the model predicts punctuation or a newline, it thinks the text is already complete, so rephrase.",
            why: "Poking at a model yourself is the only way to build a feel for when to trust it. This is also, genuinely, what a researcher does before designing an experiment: try things until something looks odd enough to chase.",
            prompts: [
                "The chemical symbol for gold is",
                "The opposite of hot is",
                "The largest ocean on Earth is the",
                "chat : Katze, chien : Hund, maison : Haus, fleur :",
            ],
            hints: [
                {
                    stage: 1,
                    text: "End your prompt right before the answer, e.g. '… is' or '… the answer is'.",
                },
                {
                    stage: 2,
                    text: "Try the French-to-German prompt. The bottom-right cell is the model's answer: the German word for 'flower'. Now look left along that bottom row into the middle layers, and you may spot the English word 'flower' before the model lands on German at the far right. It's a peek at how the model handles other languages inside.",
                },
            ],
            observationPrompt:
                "What did you try? What was the most surprising thing you saw inside the model?",
            observationPlaceholder: "The prompt you tried and the most surprising thing you saw…",
            faqs: [
                {
                    q: "I changed the prompt and it just predicted a period or a blank line. Is it broken?",
                    a: "No. That means the model thinks the sentence is already finished. Phrase your prompt so the answer is the very next word: end it right before the answer, e.g. '… is'.",
                },
                {
                    q: "Why does this model say things ChatGPT or Claude would refuse?",
                    a: "This is a raw research model with only the pre-training step. It hasn't had the extra 'alignment' training that makes assistants like ChatGPT or Claude polite or cautious. That layer is added separately; here you're seeing the model underneath it.",
                },
            ],
            progression: { on: "manual" },
        },
        {
            id: TUTORIAL_STEP_IDS.finalChallenge,
            kind: "challenge",
            title: "Final challenge",
            task: "Find a prompt where the model is sure but wrong: the top prediction has a high probability, but the answer is incorrect. It has to be a real answer, not a comma or a filler word. Run it, then describe what you saw across the layers.",
            concept:
                "You've seen the model predict one token at a time, build up an answer, reveal runner-ups, invent things it never knew, follow patterns over facts, and carry information you could move by hand. A high-probability top prediction is the model being confident, which is not the same as being correct.",
            why: "Confidently wrong is the failure mode that matters, because from the outside it looks identical to confidently right. Being able to spot it is the most transferable thing in this tutorial.",
            prompts: [
                "The inventor of the telephone was born in the year",
                "The capital city of Australia is",
                "2+2=5\n3+3=7\n10+10=",
                "The chemical symbol for tungsten is",
            ],
            hints: [
                {
                    stage: 1,
                    text: "Two shapes work well. Obscure facts: the model has to guess, and guesses confidently. Or a misleading pattern, like the wrong-arithmetic trick from earlier, where the pattern overrides the fact.",
                },
                {
                    stage: 2,
                    text: "Try one of the example prompts, or adapt one. Aim for something a person would answer differently, and end the prompt right before the answer so the model must commit to a word.",
                },
                {
                    stage: 3,
                    text: "Load this one. It sets up a false pattern and then asks a question the model answers confidently and wrongly.",
                    insertPrompt: "2+2=5\n3+3=7\n10+10=",
                },
            ],
            observationPrompt:
                "Paste the prompt you found and describe what you saw across the layers. Where did the model 'commit' to the wrong answer?",
            observationPlaceholder:
                "Your prompt, and where the model committed to the wrong answer…",
            faqs: [
                {
                    q: "Does a comma, a blank line or a word like 'the' count as a wrong answer?",
                    a: "No. Those mean the model thinks your sentence is already finished, or that it is still mid-phrase, not that it got a fact wrong. You are looking for a prompt where the model gives a real, definite answer with high probability and that answer is untrue. If you get filler, rephrase so the answer must come next.",
                },
            ],
            progression: { on: "manual" },
        },
    ],
};
