import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Cross-workbench "Chat" tool state.
 *
 * The chat is a lightweight completion playground wired to the same model the
 * rest of the workspace uses. It lives in a collapsible rail so it stays
 * unobtrusive when idle, and it can hand prompts back and forth with the
 * interpretability tools:
 *   - "spin out"  — a tool pushes its prompt into the composer (see `seed`).
 *   - "send to …" — a completed message pushes its text back into a tool
 *                    (see `injection`).
 *
 * Durable history is kept per-workspace in localStorage (the interim approach
 * documented in CLAUDE.md — a DB-backed `generations` table is the eventual
 * home). `seed` and `injection` are ephemeral handoff channels and are never
 * persisted.
 */

export type ChatInjectTarget = "lens2" | "patch-lens";

export interface ChatMessage {
    id: string;
    /** The input text sent to the model for this turn. */
    prompt: string;
    /** The model's completion text (prompt + generated continuation). Empty
     * until the generation resolves. */
    completion: string;
    /** Model the turn was generated with. */
    model: string;
    /** Tokens requested for this turn. */
    maxNewTokens: number;
    status: "pending" | "done" | "error";
    error?: string;
    createdAt: number;
}

interface SeedRequest {
    text: string;
    /** When true the controller should immediately generate a continuation
     * (the "spin out to see up to N tokens" flow). */
    autoRun: boolean;
    nonce: number;
}

interface InjectionRequest {
    target: ChatInjectTarget;
    text: string;
    nonce: number;
}

interface ChatState {
    /** Desktop rail expanded / mobile drawer open. */
    open: boolean;
    /** Tokens to generate per turn. */
    maxNewTokens: number;
    /** Per-workspace composer draft. */
    draftByWorkspace: Record<string, string>;
    /** Per-workspace conversation history (oldest first). */
    historyByWorkspace: Record<string, ChatMessage[]>;
    /** Ephemeral: a prompt spun out from a tool into the composer. */
    seed: SeedRequest | null;
    /** Ephemeral: a captured prompt to inject back into a tool. */
    injection: InjectionRequest | null;
    /** True once persisted state has been read from localStorage. */
    _hasHydrated: boolean;

    setOpen: (open: boolean) => void;
    toggleOpen: () => void;
    setMaxNewTokens: (n: number) => void;
    setDraft: (workspaceId: string, text: string) => void;
    addMessage: (workspaceId: string, message: ChatMessage) => void;
    updateMessage: (workspaceId: string, id: string, patch: Partial<ChatMessage>) => void;
    removeMessage: (workspaceId: string, id: string) => void;
    clearHistory: (workspaceId: string) => void;
    spinOut: (text: string) => void;
    consumeSeed: () => void;
    requestInjection: (target: ChatInjectTarget, text: string) => void;
    consumeInjection: () => void;
    _setHasHydrated: (v: boolean) => void;
}

const DEFAULT_MAX_NEW_TOKENS = 20;
export const MIN_MAX_NEW_TOKENS = 1;
export const MAX_MAX_NEW_TOKENS = 64;
/** Cap per-workspace history so localStorage doesn't grow without bound. */
const MAX_HISTORY_PER_WORKSPACE = 50;

const clampTokens = (n: number) =>
    Math.max(MIN_MAX_NEW_TOKENS, Math.min(MAX_MAX_NEW_TOKENS, Math.round(n)));

export const useChat = create<ChatState>()(
    persist(
        (set, get) => ({
            open: false,
            maxNewTokens: DEFAULT_MAX_NEW_TOKENS,
            draftByWorkspace: {},
            historyByWorkspace: {},
            seed: null,
            injection: null,
            _hasHydrated: false,

            setOpen: (open) => set({ open }),
            toggleOpen: () => set({ open: !get().open }),
            setMaxNewTokens: (n) => set({ maxNewTokens: clampTokens(n) }),

            setDraft: (workspaceId, text) =>
                set((s) => ({
                    draftByWorkspace: { ...s.draftByWorkspace, [workspaceId]: text },
                })),

            addMessage: (workspaceId, message) =>
                set((s) => {
                    const existing = s.historyByWorkspace[workspaceId] ?? [];
                    const next = [...existing, message].slice(-MAX_HISTORY_PER_WORKSPACE);
                    return {
                        historyByWorkspace: { ...s.historyByWorkspace, [workspaceId]: next },
                    };
                }),

            updateMessage: (workspaceId, id, patch) =>
                set((s) => {
                    const existing = s.historyByWorkspace[workspaceId];
                    if (!existing) return {};
                    return {
                        historyByWorkspace: {
                            ...s.historyByWorkspace,
                            [workspaceId]: existing.map((m) =>
                                m.id === id ? { ...m, ...patch } : m,
                            ),
                        },
                    };
                }),

            removeMessage: (workspaceId, id) =>
                set((s) => {
                    const existing = s.historyByWorkspace[workspaceId];
                    if (!existing) return {};
                    return {
                        historyByWorkspace: {
                            ...s.historyByWorkspace,
                            [workspaceId]: existing.filter((m) => m.id !== id),
                        },
                    };
                }),

            clearHistory: (workspaceId) =>
                set((s) => ({
                    historyByWorkspace: { ...s.historyByWorkspace, [workspaceId]: [] },
                })),

            spinOut: (text) =>
                set((s) => ({
                    open: true,
                    seed: { text, autoRun: true, nonce: (s.seed?.nonce ?? 0) + 1 },
                })),

            consumeSeed: () => set({ seed: null }),

            requestInjection: (target, text) =>
                set((s) => ({
                    injection: { target, text, nonce: (s.injection?.nonce ?? 0) + 1 },
                })),

            consumeInjection: () => set({ injection: null }),

            _setHasHydrated: (v) => set({ _hasHydrated: v }),
        }),
        {
            name: "workbench:chat",
            storage: createJSONStorage(() => localStorage),
            // Persist durable UI + history only. Ephemeral handoff channels
            // (seed/injection) and the hydration flag are never written.
            partialize: (s) => ({
                open: s.open,
                maxNewTokens: s.maxNewTokens,
                draftByWorkspace: s.draftByWorkspace,
                historyByWorkspace: s.historyByWorkspace,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                // Any message left "pending" was interrupted by a reload/closed
                // tab — the generation can never resolve, so surface it as an
                // error instead of a spinner that hangs forever.
                const cleaned: Record<string, ChatMessage[]> = {};
                for (const [ws, msgs] of Object.entries(state.historyByWorkspace ?? {})) {
                    cleaned[ws] = msgs.map((m) =>
                        m.status === "pending"
                            ? { ...m, status: "error" as const, error: "Interrupted" }
                            : m,
                    );
                }
                state.historyByWorkspace = cleaned;
                state._setHasHydrated(true);
            },
        },
    ),
);
