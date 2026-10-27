import { redirect } from "next/navigation";

/** Old links to retired chart tools land on the workspace, which opens its most recent chart. */
export default async function Page({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params;
    redirect(`/workbench/${workspaceId}`);
}
