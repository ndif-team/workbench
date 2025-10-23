"use client";

import { ViewProvider } from "@/components/charts/ViewProvider";
import { ReactNode } from "react";
import { useParams } from "next/navigation";

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { chartId } = useParams<{ workspaceId: string; chartId: string }>();

    return <ViewProvider chartId={chartId}>{children}</ViewProvider>;
}
