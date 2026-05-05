import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
    DEFAULT_GENERATION_PARAMS,
    type GenerationItem,
    type GenerationParams,
    type GenerationStatus,
} from "@/types/generation";

type Bucket = {
    items: GenerationItem[];
    params: GenerationParams;
};

type Buckets = Record<string, Bucket>;

interface GenerationPanelState {
    buckets: Buckets;
    open: boolean;
    setOpen: (open: boolean) => void;
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;

    getBucket: (workspaceId: string, model: string) => Bucket;
    addPending: (
        workspaceId: string,
        model: string,
        prompt: string,
        params: GenerationParams,
    ) => string;
    setStatus: (
        workspaceId: string,
        model: string,
        id: string,
        status: GenerationStatus,
        patch?: Partial<GenerationItem>,
    ) => void;
    removeItem: (workspaceId: string, model: string, id: string) => void;
    clearItems: (workspaceId: string, model: string) => void;
    updateParams: (
        workspaceId: string,
        model: string,
        patch: Partial<GenerationParams>,
    ) => void;
}

const bucketKey = (workspaceId: string, model: string) => `${workspaceId}::${model}`;

const emptyBucket = (): Bucket => ({
    items: [],
    params: { ...DEFAULT_GENERATION_PARAMS },
});

const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const useGenerationPanel = create<GenerationPanelState>()(
    persist(
        (set, get) => ({
            buckets: {},
            open: true,
            setOpen: (open) => set({ open }),
            collapsed: false,
            setCollapsed: (collapsed) => set({ collapsed }),

            getBucket: (workspaceId, model) => {
                const key = bucketKey(workspaceId, model);
                return get().buckets[key] ?? emptyBucket();
            },

            addPending: (workspaceId, model, prompt, params) => {
                const key = bucketKey(workspaceId, model);
                const id = newId();
                const item: GenerationItem = {
                    id,
                    createdAt: Date.now(),
                    model,
                    prompt,
                    params,
                    status: "pending",
                };
                set((state) => {
                    const existing = state.buckets[key] ?? emptyBucket();
                    return {
                        buckets: {
                            ...state.buckets,
                            [key]: {
                                items: [item, ...existing.items],
                                params,
                            },
                        },
                    };
                });
                return id;
            },

            setStatus: (workspaceId, model, id, status, patch) => {
                const key = bucketKey(workspaceId, model);
                set((state) => {
                    const existing = state.buckets[key];
                    if (!existing) return state;
                    return {
                        buckets: {
                            ...state.buckets,
                            [key]: {
                                ...existing,
                                items: existing.items.map((it) =>
                                    it.id === id ? { ...it, ...patch, status } : it,
                                ),
                            },
                        },
                    };
                });
            },

            removeItem: (workspaceId, model, id) => {
                const key = bucketKey(workspaceId, model);
                set((state) => {
                    const existing = state.buckets[key];
                    if (!existing) return state;
                    return {
                        buckets: {
                            ...state.buckets,
                            [key]: {
                                ...existing,
                                items: existing.items.filter((it) => it.id !== id),
                            },
                        },
                    };
                });
            },

            clearItems: (workspaceId, model) => {
                const key = bucketKey(workspaceId, model);
                set((state) => {
                    const existing = state.buckets[key];
                    if (!existing) return state;
                    return {
                        buckets: {
                            ...state.buckets,
                            [key]: { ...existing, items: [] },
                        },
                    };
                });
            },

            updateParams: (workspaceId, model, patch) => {
                const key = bucketKey(workspaceId, model);
                set((state) => {
                    const existing = state.buckets[key] ?? emptyBucket();
                    return {
                        buckets: {
                            ...state.buckets,
                            [key]: {
                                ...existing,
                                params: { ...existing.params, ...patch },
                            },
                        },
                    };
                });
            },
        }),
        {
            name: "workbench:generation-panel",
            storage: createJSONStorage(() => localStorage),
            version: 1,
            partialize: (state) => ({
                buckets: state.buckets,
                open: state.open,
                collapsed: state.collapsed,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                const next: Buckets = {};
                for (const [key, bucket] of Object.entries(state.buckets)) {
                    next[key] = {
                        ...bucket,
                        items: bucket.items.map((it) =>
                            it.status === "pending"
                                ? {
                                      ...it,
                                      status: "error",
                                      error: "Generation interrupted by reload.",
                                  }
                                : it,
                        ),
                    };
                }
                state.buckets = next;
            },
        },
    ),
);
