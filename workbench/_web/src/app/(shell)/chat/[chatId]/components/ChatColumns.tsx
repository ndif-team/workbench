import type { ReactNode, Ref } from "react";

/**
 * The chat page's body: the conversation, which scrolls, over the composer,
 * both in one centered column. Shared with the page shown while a chat is
 * being started (`PendingChatPage`), so the chat's page opens in its place
 * without moving anything.
 */
export function ChatColumns({
    scrollRef,
    thread,
    composer,
}: {
    scrollRef?: Ref<HTMLDivElement>;
    thread: ReactNode;
    composer: ReactNode;
}) {
    return (
        <div className="flex size-full min-h-0 flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-4 py-6">{thread}</div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">{composer}</div>
        </div>
    );
}
