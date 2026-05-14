"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getModels, useModelsQuery } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import type { Model } from "@/types/models";
import { cn } from "@/lib/utils";
import {
    deriveHeat,
    FILTERABLE_HEAT,
    type ModelGroup,
    type ModelHeat,
} from "@/components/model-selector/status";
import { useModelsSection } from "@/stores/useModelsSection";
import { ModelRowCarousel } from "./ModelRowCarousel";
import { ModelsSectionHeader } from "./ModelsSectionHeader";
import { ModelsFetchErrorBanner } from "./ModelsFetchErrorBanner";
import type { ModelCardModel } from "./ModelCard";

const URL_STATUS = "models_status";
const URL_GROUP = "models_group";

const VALID_GROUPS: ReadonlyArray<ModelGroup> = ["base", "chat"];

const HEAT_ORDER: ReadonlyArray<ModelHeat> = [
    "hot",
    "warm",
    "cold",
    "unknown",
    "gated",
    "unavailable",
];

const heatRank = (h: ModelHeat) => {
    const i = HEAT_ORDER.indexOf(h);
    return i === -1 ? HEAT_ORDER.length : i;
};

const byHeat = (a: ModelCardModel, b: ModelCardModel) =>
    heatRank(a.heat) - heatRank(b.heat) || a.name.localeCompare(b.name);

/** Content-equality for Sets. Used by the URL→state sync effects so they
 * keep the previous Set reference (and skip a re-render) when the URL change
 * was originated by our own writeFilterUrl. */
const setsEqual = <T,>(a: Set<T>, b: Set<T>): boolean => {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
};

const toCardModel = (m: Model): ModelCardModel => {
    const slash = m.name.lastIndexOf("/");
    const org = slash === -1 ? "" : m.name.slice(0, slash);
    const name = slash === -1 ? m.name : m.name.slice(slash + 1);
    return {
        org,
        name,
        group: m.is_chat ? "chat" : "base",
        heat: deriveHeat(m),
        params: m.params,
        layers: m.n_layers,
    };
};

interface ModelsSectionProps {
    cardHref?: (m: ModelCardModel) => string | undefined;
    onCardClick?: (m: ModelCardModel) => void;
}

export function ModelsSection({
    cardHref = (m) => `https://huggingface.co/${m.org}/${m.name}`,
    onCardClick,
}: ModelsSectionProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();

    const collapsed = useModelsSection((s) => s.collapsed);
    const setCollapsed = useModelsSection((s) => s.setCollapsed);
    const hasHydrated = useModelsSection((s) => s._hasHydrated);

    const initialStatus = useMemo(() => {
        const raw = searchParams.get(URL_STATUS);
        if (!raw) return new Set<ModelHeat>();
        return new Set(
            raw
                .split(",")
                .filter((s): s is ModelHeat =>
                    FILTERABLE_HEAT.includes(s as ModelHeat),
                ),
        );
    }, [searchParams]);

    const initialGroup = useMemo(() => {
        const raw = searchParams.get(URL_GROUP);
        if (!raw) return new Set<ModelGroup>();
        return new Set(
            raw
                .split(",")
                .filter((s): s is ModelGroup =>
                    VALID_GROUPS.includes(s as ModelGroup),
                ),
        );
    }, [searchParams]);

    const [statusFilters, setStatusFilters] = useState<Set<ModelHeat>>(initialStatus);
    const [groupFilters, setGroupFilters] = useState<Set<ModelGroup>>(initialGroup);
    const [query, setQuery] = useState("");

    // Keep filter state mirrored to the URL on every searchParams change.
    // `useState` only seeds from `initialStatus` / `initialGroup` on the
    // *first* render; without these effects, any URL change that wasn't
    // originated by our own toggle handlers (back/forward, address-bar edit,
    // another component writing the same params) would leave the chips out
    // of sync with the URL. The functional updater + setsEqual short-circuit
    // means our own writes don't trigger an extra re-render.
    useEffect(() => {
        setStatusFilters((prev) => (setsEqual(prev, initialStatus) ? prev : initialStatus));
    }, [initialStatus]);
    useEffect(() => {
        setGroupFilters((prev) => (setsEqual(prev, initialGroup) ? prev : initialGroup));
    }, [initialGroup]);

    const writeFilterUrl = useCallback(
        (nextStatus: Set<ModelHeat>, nextGroup: Set<ModelGroup>) => {
            const params = new URLSearchParams(searchParams.toString());
            if (nextStatus.size === 0) params.delete(URL_STATUS);
            else params.set(URL_STATUS, Array.from(nextStatus).join(","));
            if (nextGroup.size === 0) params.delete(URL_GROUP);
            else params.set(URL_GROUP, Array.from(nextGroup).join(","));
            const qs = params.toString();
            router.replace(qs ? `?${qs}` : "?", { scroll: false });
        },
        [router, searchParams],
    );

    // Live refs of the partner filter set, read inside the functional updater
    // so the URL write always sees the freshest value — defends against a
    // double-toggle landing two updates in a single render cycle and the
    // second one writing a stale partner set to the URL.
    const statusFiltersRef = useRef(statusFilters);
    const groupFiltersRef = useRef(groupFilters);
    useEffect(() => {
        statusFiltersRef.current = statusFilters;
    }, [statusFilters]);
    useEffect(() => {
        groupFiltersRef.current = groupFilters;
    }, [groupFilters]);

    const onToggleStatus = useCallback(
        (k: ModelHeat) => {
            setStatusFilters((prev) => {
                const next = new Set(prev);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                writeFilterUrl(next, groupFiltersRef.current);
                return next;
            });
        },
        [writeFilterUrl],
    );

    const onToggleGroup = useCallback(
        (g: ModelGroup) => {
            setGroupFilters((prev) => {
                const next = new Set(prev);
                if (next.has(g)) next.delete(g);
                else next.add(g);
                writeFilterUrl(statusFiltersRef.current, next);
                return next;
            });
        },
        [writeFilterUrl],
    );

    const {
        data: rawModels,
        error,
        isLoading,
    } = useModelsQuery();

    const cards = useMemo(
        () => (rawModels ?? []).map(toCardModel),
        [rawModels],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return cards
            .filter((m) => {
                if (statusFilters.size && !statusFilters.has(m.heat)) return false;
                if (groupFilters.size && !groupFilters.has(m.group)) return false;
                if (q) {
                    const full = `${m.org}/${m.name}`.toLowerCase();
                    if (!full.includes(q)) return false;
                }
                return true;
            })
            .sort(byHeat);
    }, [cards, query, statusFilters, groupFilters]);

    const baseCards = useMemo(() => filtered.filter((m) => m.group === "base"), [filtered]);
    const chatCards = useMemo(() => filtered.filter((m) => m.group === "chat"), [filtered]);

    const groupPreviews = useMemo(() => {
        const previewFor = (list: ModelCardModel[]) => {
            const hot = list.filter((m) => m.heat === "hot");
            return hot.length > 0 ? hot.slice(0, 2) : list.slice(0, 2);
        };
        const allBase = cards.filter((m) => m.group === "base");
        const allChat = cards.filter((m) => m.group === "chat");
        return {
            base: { total: allBase.length, preview: previewFor(allBase) },
            chat: { total: allChat.length, preview: previewFor(allChat) },
        };
    }, [cards]);

    // Local retry-in-flight flag. Drives the banner spinner reliably, since
    // `useModelsQuery` has `enabled: false` and its observer's `isFetching`
    // doesn't track manual `queryClient.fetchQuery` calls cleanly.
    const [isRetrying, setIsRetrying] = useState(false);

    const onRetry = useCallback(() => {
        setIsRetrying(true);
        // Drop the cached error first; otherwise the next `fetchQuery` may
        // short-circuit by returning the cached error (`staleTime: Infinity`
        // in the standard call inside useModelsQuery treats errors as "fresh"
        // too). Calling removeQueries clears both data and error state.
        queryClient.removeQueries({ queryKey: queryKeys.models.all });
        queryClient
            .fetchQuery({
                queryKey: queryKeys.models.all,
                queryFn: getModels,
                retry: false,
            })
            .catch(() => {
                /* error lives in the cache; banner re-reads on next render */
            })
            .finally(() => setIsRetrying(false));
    }, [queryClient]);

    return (
        <section
            className={cn(
                "group/section relative mb-6 rounded-xl border-2 overflow-hidden transition-all duration-200",
                // Hide until the persisted `collapsed` value has hydrated from
                // localStorage — otherwise users who saved `collapsed: true`
                // would see a brief flash of the expanded layout on every
                // page load. Layout space is still reserved via `mb-6`.
                !hasHydrated && "invisible",
                collapsed
                    ? [
                          "bg-card/35 dark:bg-card/25 border-border/40 shadow-none",
                          "cursor-pointer",
                          "hover:bg-card/65 dark:hover:bg-card/55 hover:border-border/70",
                          "hover:shadow-[0_16px_40px_-14px_hsl(var(--primary)/0.18),0_4px_12px_-2px_hsl(0_0%_0%/0.05)]",
                          "dark:hover:shadow-[0_18px_44px_-14px_hsl(var(--primary)/0.28),0_4px_16px_hsl(0_0%_0%/0.35)]",
                      ]
                    : [
                          "bg-card/65 dark:bg-card/55 border-border/75",
                          "shadow-[0_16px_40px_-14px_hsl(var(--primary)/0.18),0_4px_12px_-2px_hsl(0_0%_0%/0.05)]",
                          "dark:shadow-[0_18px_44px_-14px_hsl(var(--primary)/0.28),0_4px_16px_hsl(0_0%_0%/0.35)]",
                      ],
            )}
            aria-label="Models"
            // Mouse "click anywhere" affordance when collapsed. NOT a button:
            // the chevron <Button> inside is the canonical (and keyboard-
            // accessible) toggle, and having both role="button" on the
            // section AND a real <button> inside is an ARIA hierarchy
            // violation. Mouse users still get expand-on-click here; keyboard
            // / screen-reader users use the chevron.
            onClick={collapsed ? () => setCollapsed(false) : undefined}
        >
            <div
                aria-hidden
                className={cn(
                    "absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-purple-600 transition-opacity duration-150",
                    collapsed ? "opacity-15 group-hover/section:opacity-35" : "opacity-35",
                )}
            />
            <div className={cn("px-4 transition-[padding] duration-200", collapsed ? "pt-4 pb-10" : "py-4")}>
                <ModelsSectionHeader
                    collapsed={collapsed}
                    onToggle={() => setCollapsed(!collapsed)}
                    total={cards.length}
                    filteredTotal={filtered.length}
                    groupPreviews={groupPreviews}
                    hasError={!!error}
                    isLoading={isLoading && !rawModels}
                    query={query}
                    onQuery={setQuery}
                    statusFilters={statusFilters}
                    onToggleStatus={onToggleStatus}
                    groupFilters={groupFilters}
                    onToggleGroup={onToggleGroup}
                />
            </div>
            {!collapsed && <div aria-hidden className="mx-6 h-px bg-border" />}

            {!collapsed && (
                <div className="p-3 pt-1">
                    {isLoading && !rawModels ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            Loading models…
                        </div>
                    ) : error ? (
                        <ModelsFetchErrorBanner
                            onRetry={onRetry}
                            isRetrying={isRetrying}
                        />
                    ) : cards.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            No models available
                        </div>
                    ) : (
                        (() => {
                            // A row is shown only if its group is not filtered
                            // out AND it has at least one card after the
                            // active filters (search + status + group). When
                            // both rows end up empty due to filters, swap in
                            // a single "no matches" message instead of two
                            // empty placeholders.
                            const showBase =
                                (groupFilters.size === 0 ||
                                    groupFilters.has("base")) &&
                                baseCards.length > 0;
                            const showChat =
                                (groupFilters.size === 0 ||
                                    groupFilters.has("chat")) &&
                                chatCards.length > 0;
                            if (!showBase && !showChat) {
                                return (
                                    <div className="py-8 text-center text-xs text-muted-foreground">
                                        No models match the current filters.
                                    </div>
                                );
                            }
                            return (
                                <>
                                    {showBase && (
                                        <ModelRowCarousel
                                            label="Base"
                                            models={baseCards}
                                            cardHref={cardHref}
                                            onCardClick={onCardClick}
                                        />
                                    )}
                                    {showChat && (
                                        <ModelRowCarousel
                                            label="Chat"
                                            models={chatCards}
                                            cardHref={cardHref}
                                            onCardClick={onCardClick}
                                        />
                                    )}
                                </>
                            );
                        })()
                    )}
                </div>
            )}
        </section>
    );
}
