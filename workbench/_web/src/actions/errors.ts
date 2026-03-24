export class TokenizerLoadError extends Error {
    constructor(model: string, cause?: unknown) {
        super(
            `Could not load tokenizer for ${model}. The model may be gated and require authentication.`,
        );
        this.name = "TokenizerLoadError";
        this.cause = cause;
    }
}
