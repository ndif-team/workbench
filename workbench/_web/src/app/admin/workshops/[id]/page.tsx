"use client";

import { useParams } from "next/navigation";

import { WorkshopAnalyticsView } from "./components/WorkshopAnalyticsView";

/**
 * Per-workshop analytics dashboard. Nested under admin/workshops/layout.tsx, so
 * the getAdminEmail() → notFound() gate is inherited; the analytics server
 * actions re-check requireAdmin() regardless (they're public RPCs).
 */
export default function WorkshopAnalyticsPage() {
    const { id } = useParams<{ id: string }>();
    return <WorkshopAnalyticsView workshopId={id} />;
}
