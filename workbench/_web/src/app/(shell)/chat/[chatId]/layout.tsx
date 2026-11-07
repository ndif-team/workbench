import { ChatWorkspaceScope } from "@/app/(shell)/components/WorkspaceScopes";
import { ItemPage } from "@/app/(shell)/components/items/ItemPage";

export default async function ChatLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ chatId: string }>;
}) {
    const { chatId } = await params;
    return (
        <ChatWorkspaceScope chatId={chatId}>
            <ItemPage item={{ kind: "chat", id: chatId }}>{children}</ItemPage>
        </ChatWorkspaceScope>
    );
}
