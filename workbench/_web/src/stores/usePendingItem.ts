import { create } from "zustand";

import type { ChartLaunchRequest } from "@/lib/chartLaunch";
import type { ChatDraft } from "@/types/chats";

/** What a launch from inside the app is creating: a chart, or a chat. */
type PendingLaunch =
    | { kind: "chart"; request: ChartLaunchRequest }
    | { kind: "chat"; chat: ChatDraft };

/** A chart or chat launched from inside the app that is still being created. */
type PendingItem = PendingLaunch & {
    /** Tells this launch apart from earlier ones. */
    id: number;
    /** The path of the page it was launched from. */
    from: string;
};

interface PendingItemState {
    pending: PendingItem | null;
    /** Launches started so far; numbers each new one. */
    launches: number;
    /** Marks an item as being created; returns its launch id. */
    start: (item: PendingLaunch & { from: string }) => number;
    /** Ends launch `id`, or whichever is pending when no id is given. */
    clear: (id?: number) => void;
}

/**
 * The chart `useLaunchChart` or the chat `useLaunchChat` is creating, which
 * the shell shows as its page (`PendingChartPage`, `PendingChatPage`) in place
 * of the page it was launched from, until the item's own page opens. The
 * shell clears it when the page changes, so a launch whose user went
 * elsewhere meanwhile no longer opens.
 */
export const usePendingItem = create<PendingItemState>()((set, get) => ({
    pending: null,
    launches: 0,
    start: (item) => {
        const id = get().launches + 1;
        set({ launches: id, pending: { ...item, id } });
        return id;
    },
    clear: (id) => {
        if (id === undefined || get().pending?.id === id) set({ pending: null });
    },
}));
