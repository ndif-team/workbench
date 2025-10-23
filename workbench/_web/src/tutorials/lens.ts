import type { ExtendedStepType, TutorialChapterProgress, TutorialProgress } from "@/types/tutorial";

const LogitLensBeginner: ExtendedStepType[] = [
    {
        selector: "sidebar",
        content:
            "Most LLMs use a transformer architecture to predict the next token in a sequence, where a token is typically a word, subword, or character. As input passes through each transformer block, latent vectors (intermediate representations of the tokens) are modified. The output of the final transformer block is then converted into a probability distribution over the vocabulary. The token with the highest probability is chosen as the model's next predicted token.\n\nBecause latent vectors maintain the same shape across all transformer layers, any intermediate latent can be passed through the model's final projection layer to produce a token distribution. This enables us to \"peek\" inside the model and see how its predictions evolve from one layer to the next.",
        styles: {
            maskArea: (base) => ({
                ...base,
                display: "none",
            }),
        },
    },
    {
        selector: "#new-completion",
        content:
            "Start by creating a new completion for the model. We'll use the default selected model for now.",
        trigger: {
            type: "click",
            target: "#new-completion",
        },
    },
    {
        selector: "sidebar",
        content: `The question that you are exploring using logit lens determines what prompts will be useful in your experiment.

            Logit lens is most effective when the expected output is a single, unambiguous token, as discussed above.
            Phrases that end in \`:\` or \`is\` often work well to guide the model to produce a concise answer like \`TRUE\` or \`Paris.\` Using structured prompts that are likely to only produce certain kinds of expected output are also helpful when transitioning from exploring a few sample prompts to exploring a whole dataset of prompts where it is no longer feasible to visualize and manually categorize the output of each prompt.

            If your expected solution is a word not included in the vocabulary of the model and is instead composed of multiple tokens, logit lens will not produce it as output. In these cases, it is more likely that the initial token in the word will be output.

            A prompt like \`English: mountain - Français:\` demonstrates how the tokenizer for the LLM might not have the expected output (\`montagne\`) in its vocabulary. The output of the LLM for this prompt is \`mont\`, and while we might be able to extrapolate that the LLM is predicting what we expect, this sort of output is still hard to work with.

            Additionally, there may be multiple ways to tokenize the same output. The inclusion of spaces, capitalization, and other punctuation may cause the actual output to differ from your expected output. Multi-shot prompting, where you demonstrate to the model the expected format of the output, can help to mitigate this issue.

            This may seem like a potentially frustrating issue (and it can be), but remember that logit lens, like any experiment design process, is iterative. If a prompt isn't working because of the tokens, just try something new!

            Let's try a few prompts to see how logit lens works.
            `,
        styles: {
            maskArea: (base) => ({
                ...base,
                display: "none",
            }),
        },
    },
    {
        selector: "#completion-text",
        content: 'In the text area, enter a the sentence "The Eiffel Tower is in"',
        trigger: {
            type: "textInput",
            expectedValue: "The Eiffel Tower is in",
        },
    },
    {
        selector: "#tokenize-button",
        content: "Click the tokenize button to render your sentence as tokens in the box below.",
        trigger: {
            type: "click",
            target: "#tokenize-button",
        },
    },
    {
        selector: "#token-area",
        content:
            'Hovering over the tokenized sentence highlights the individual tokens. Now how the word "Eiffel" is three tokens. Select the last to proceed.',
        trigger: {
            type: "tokenHighlight",
            expectedTokenIndex: 3,
        },
    },
    {
        selector: "#view-predictions",
        content: "Click the keyboard button to view predictions.",
        trigger: {
            type: "click",
            target: "#view-predictions",
        },
    },
    {
        selector: "#token-area",
        content: "Click the highlighted token to view predictions.",
        trigger: {
            type: "tokenClick",
            expectedTokenIndex: 3,
        },
    },
    {
        selector: "#predictions-display",
        content:
            "The predictions are displayed in the box below. Notice the probability of the obvious completion.",
    },
    {
        selector: "#completion-card",
        content:
            "Now, try the steps above with a different token. Select the last token in the sentence -- what does the model predict?",
    },
];

const LogitLensIntermediate: ExtendedStepType[] = [
    {
        selector: "#new-completion",
        content:
            "For most experiments, the best prompts will be incomplete statements with a correct, expected single-token solution. Start by entering a prompt like `The Eiffel Tower is in the city of`",
    },
];

const LogitLensTutorialChapters: TutorialChapterProgress[] = [
    {
        title: "Logit Lens Beginner",
        steps: LogitLensBeginner,
        completed: false,
    },
    {
        title: "Logit Lens Intermediate",
        steps: LogitLensIntermediate,
        completed: false,
    },
];

export const LogitLensTutorial: TutorialProgress = {
    chapters: LogitLensTutorialChapters,
    currentChapter: 0,
    description:
        'Logit Lens is a tool that allows you to visualize the internal states of a model. It works by inserting a language modeling head at intermediate layers of the model. This lets you see what the model is "thinking" at each step of processing.',
};
