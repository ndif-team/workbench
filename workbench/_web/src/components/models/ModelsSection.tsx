"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getModels, useModelsQuery } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import type { Model } from "@/types/models";
import {
    deriveHeat,
    FILTERABLE_HEAT,
    HEAT_ORDER,
    type ModelGroup,
    type ModelHeat,
} from "@/components/model-selector/status";
import { useModelDeployment } from "@/stores/useModelDeployment";
import { ModelsSectionHeader } from "./ModelsSectionHeader";
import { ModelsFetchErrorBanner } from "./ModelsFetchErrorBanner";
import { ModelLaunchDialog, type ModelLaunchMode } from "./ModelLaunchDialog";
import { ModelCard, type ModelCardModel } from "./ModelCard";

const URL_STATUS = "models_status";
const URL_GROUP = "models_group";

const VALID_GROUPS: ReadonlyArray<ModelGroup> = ["base", "chat"];

const heatRank = (h: ModelHeat) => {
    const i = HEAT_ORDER.indexOf(h);
    return i === -1 ? HEAT_ORDER.length : i;
};

const byHeat = (a: ModelCardModel, b: ModelCardModel) => {
    // Models currently deploying sort to the very front (ahead of hot) so the
    // user can see warmup progress at a glance. This covers both our own
    // in-flight warmup (the `deploying` flag) and a "deploying" catalog heat.
    const aDeploying = !!a.deploying || a.heat === "deploying";
    const bDeploying = !!b.deploying || b.heat === "deploying";
    if (aDeploying !== bDeploying) return aDeploying ? -1 : 1;

    const heatDiff = heatRank(a.heat) - heatRank(b.heat);
    if (heatDiff !== 0) return heatDiff;

    // Within the cold tier, push models without a Jacobian lens to the bottom
    // so the j-lens-capable cold models a user would deploy surface first.
    if (a.heat === "cold" && b.heat === "cold") {
        const jacobianDiff = Number(!!b.has_jacobian) - Number(!!a.has_jacobian);
        if (jacobianDiff !== 0) return jacobianDiff;
    }

    return a.name.localeCompare(b.name);
};

/** Content-equality for Sets. Used by the URL→state sync effects so they
 * keep the previous Set reference (and skip a re-render) when the URL change
 * was originated by our own writeFilterUrl. */
const setsEqual = <T,>(a: Set<T>, b: Set<T>): boolean => {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
};

const toCardModel = (m: Model, isSignedIn: boolean): ModelCardModel => {
    const slash = m.name.lastIndexOf("/");
    const org = slash === -1 ? "" : m.name.slice(0, slash);
    const name = slash === -1 ? m.name : m.name.slice(slash + 1);
    let heat = deriveHeat(m);
    // Deploying a cold model requires a real sign-in, so to a signed-out
    // visitor a cold model is effectively locked. Show it as gated — which
    // also makes the card non-interactive (see ModelCard), disabling the
    // deploy entry point entirely.
    if (!isSignedIn && heat === "cold") heat = "gated";
    return {
        org,
        name,
        group: m.is_chat ? "chat" : "base",
        heat,
        params: m.params,
        layers: m.n_layers,
        has_jacobian: m.has_jacobian,
        avatarUrl: m.org?.avatar_url,
    };
};

interface ModelsSectionProps {
    cardHref?: (m: ModelCardModel) => string | undefined;
    onCardClick?: (m: ModelCardModel) => void;
    /** When false, cold models render as gated (locked) and can't be deployed —
     * deployment requires a real sign-in. Defaults to true. */
    isSignedIn?: boolean;
}

/**
 * The models the backend serves, as a filterable grid set straight on the
 * page and filling it: hottest first, filters (type, status, search) mirrored
 * to the URL.
 * The grid lists every model and scrolls under the header, its cards fading
 * out at the list's top and bottom edges (`scroll-fade-y`); a change of filter
 * or search scrolls it back to the top. A card opens the launch dialog (or
 * deploys a cold model).
 */
export function ModelsSection({
    cardHref = (m) => `https://huggingface.co/${m.org}/${m.name}`,
    onCardClick: onCardClickProp,
    isSignedIn = true,
}: ModelsSectionProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const deployments = useModelDeployment((s) => s.deployments);

    const initialStatus = useMemo(() => {
        const raw = searchParams.get(URL_STATUS);
        if (!raw) return new Set<ModelHeat>();
        return new Set(
            raw.split(",").filter((s): s is ModelHeat => FILTERABLE_HEAT.includes(s as ModelHeat)),
        );
    }, [searchParams]);

    const initialGroup = useMemo(() => {
        const raw = searchParams.get(URL_GROUP);
        if (!raw) return new Set<ModelGroup>();
        return new Set(
            raw.split(",").filter((s): s is ModelGroup => VALID_GROUPS.includes(s as ModelGroup)),
        );
    }, [searchParams]);

    const [statusFilters, setStatusFilters] = useState<Set<ModelHeat>>(initialStatus);
    const [groupFilters, setGroupFilters] = useState<Set<ModelGroup>>(initialGroup);
    const [query, setQuery] = useState("");
    const [dialog, setDialog] = useState<{
        model: ModelCardModel;
        mode: ModelLaunchMode;
    } | null>(null);

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

    const { data: rawModels, error, isLoading } = useModelsQuery();

    const cards = useMemo(
        () =>
            (rawModels ?? []).map((m) => {
                const phase = deployments[m.name]?.phase;
                return {
                    ...toCardModel(m, isSignedIn),
                    deploying: phase === "submitting" || phase === "deploying",
                };
            }),
        [rawModels, deployments, isSignedIn],
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

    const scrollArea = useRef<HTMLDivElement>(null);
    useEffect(() => {
        scrollArea.current?.scrollTo({ top: 0 });
    }, [query, statusFilters, groupFilters]);

    const onCardClick =
        onCardClickProp ??
        ((m: ModelCardModel) =>
            setDialog({ model: m, mode: m.heat === "cold" ? "deploy" : "launch" }));

    return (
        <section aria-label="Models" className="flex h-full min-h-0 flex-col">
            <div className="pl-1">
                <ModelsSectionHeader
                    total={cards.length}
                    filteredTotal={filtered.length}
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

            <div ref={scrollArea} className="scroll-fade-y min-h-0 flex-1 overflow-y-auto">
                {isLoading && !rawModels ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                        Loading models…
                    </div>
                ) : error ? (
                    <div className="pt-3">
                        <ModelsFetchErrorBanner onRetry={onRetry} isRetrying={isRetrying} />
                    </div>
                ) : cards.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                        No models available
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                        No models match the current filters.
                    </div>
                ) : (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4 py-3">
                        {filtered.map((m) => (
                            <li key={`${m.org}/${m.name}`} className="flex">
                                <ModelCard
                                    m={m}
                                    onClick={() => onCardClick(m)}
                                    href={cardHref(m)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ModelLaunchDialog
                model={dialog?.model ?? null}
                mode={dialog?.mode ?? "deploy"}
                onOpenChange={(open) => {
                    if (!open) setDialog(null);
                }}
            />
        </section>
    );
}
