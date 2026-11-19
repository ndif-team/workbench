"use client";

import { useRef, type ReactNode } from "react";

import { PatchPromptSection, PatchTools } from "@/components/activation-patching/toolkit";
import { ModelControl } from "@/components/ModelControl";
import { useIsMobile } from "@/hooks/useIsMobile";
import { launchTool, type ChartLaunchRequest } from "@/lib/chartLaunch";
import { cn } from "@/lib/utils";
import type { ToolType } from "@/types/charts";
import { ChartPlaceholder } from "../ChartPlaceholder";
import { FloatingToolComposer } from "../FloatingToolComposer";
import { LensParams } from "../lens/LensParams";
import { LensPromptEditor } from "../lens/LensPromptEditor";
import { ToolPanelHeader } from "../ToolPanelHeader";
import { ToolRunButton } from "../ToolRunButton";
import { toolMeta } from "../toolMeta";
import { PendingItemHeader } from "./PendingItemHeader";

type ComposerTool = Exclude<ToolType, "patch-lens">;

/**
 * The page of a chart that is being created, shown from the moment it's asked
 * for until the chart's own page opens (`usePendingItem`, and `/new`): the
 * chart page's header and its tool's page before a run, built from that page's
 * own parts (its prompt fields, parameters, Run and placeholder, or on a phone
 * its composer) and holding the prompts it was launched with, so the page
 * fills in around them rather than replacing a spinner. Nothing in it can be
 * used (`inert`).
 */
export function PendingChartPage({ request }: { request: ChartLaunchRequest }) {
    const tool = launchTool(request.tool);
    const isMobile = useIsMobile();
    const prompts =
        request.deploy === "true"
            ? []
            : tool === "activation-patching"
              ? [request.srcPrompt ?? "", request.tgtPrompt ?? ""]
              : [request.prompt ?? ""];

    return (
        <div className="flex size-full min-h-0 flex-col" aria-busy="true">
            <span role="status" className="sr-only">
                Creating chart…
            </span>
            <PendingItemHeader
                start={<ModelControl compact className={FloatingToolComposer.HIDDEN_BESIDE} />}
                workspaceId={request.workspaceId}
                title="Untitled chart"
                placeholder
            />
            <div inert className="min-h-0 flex-1">
                {isMobile === undefined ? null : tool === "patch-lens" ? (
                    <PendingChartPage.Frame tool={tool} isMobile={isMobile} />
                ) : (
                    <PendingChartPage.Frame
                        tool={tool}
                        isMobile={isMobile}
                        chart={<ChartPlaceholder {...ChartPlaceholder.EMPTY[tool]} />}
                    >
                        <PendingChartPage.Controls
                            tool={tool}
                            prompts={prompts}
                            floating={isMobile}
                        />
                    </PendingChartPage.Frame>
                )}
            </div>
        </div>
    );
}

/** Each tool's controls panel's share of the width (its `defaultSize`). */
PendingChartPage.CONTROLS_WIDTH = {
    "logit-lens": 25,
    jlens: 25,
    "activation-patching": 30,
    "patch-lens": 27,
} as const satisfies Record<ToolType, number>;

/** A chart page's layout: the controls panel beside the chart, or on a phone
 * the chart over room for the composer its controls render. */
PendingChartPage.Frame = function PendingChartFrame({
    tool,
    isMobile,
    chart,
    children,
}: {
    tool: ToolType;
    isMobile: boolean;
    chart?: ReactNode;
    children?: ReactNode;
}) {
    const surface = "rounded border bg-secondary/80 dark:bg-secondary/50";
    if (isMobile) {
        return (
            <div
                className={cn(
                    "flex size-full min-h-0 flex-col gap-2 overflow-auto p-2 pt-0",
                    FloatingToolComposer.PAGE_SPACE,
                )}
            >
                <div className={cn("min-h-[50vh] flex-1", surface)}>{chart}</div>
                {children}
            </div>
        );
    }
    return (
        <div className="size-full px-3 pb-3">
            <div className={cn("flex size-full", surface)}>
                <div
                    className="flex h-full flex-col border-r md:min-w-64"
                    style={{ width: `${PendingChartPage.CONTROLS_WIDTH[tool]}%` }}
                >
                    {children ?? (
                        <ToolPanelHeader
                            title={toolMeta(tool)?.label ?? ""}
                            {...PendingChartPage.ACTIONS}
                        />
                    )}
                </div>
                <div className="min-w-0 flex-1">{chart}</div>
            </div>
        </div>
    );
};

/** A panel's draft-state actions with nothing to show. */
PendingChartPage.ACTIONS = {
    viewMode: false,
    showReset: false,
    showSync: false,
    isExecuting: false,
    onReset: () => {},
    onSync: () => {},
};

/** A tool's controls before a run, as its `*Controls` lay them out. */
PendingChartPage.Controls = function PendingChartControls({
    tool,
    prompts,
    floating,
}: {
    tool: ComposerTool;
    prompts: string[];
    floating: boolean;
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tokenContainerRef = useRef<HTMLDivElement>(null);
    const noop = () => {};
    const title = toolMeta(tool)?.label ?? "";
    const actions = PendingChartPage.ACTIONS;
    const header = (
        <ToolPanelHeader title={title} reference={toolMeta(tool)?.reference} {...actions} />
    );

    if (tool === "activation-patching") {
        const patchTools = (
            <PatchTools
                srcTokens={[]}
                tgtTokens={[]}
                srcPos={[]}
                tgtPos={[]}
                tgtFreeze={[]}
                rangeMode={false}
                onRangeModeChange={noop}
                freezeMode={false}
                onFreezeModeChange={noop}
                disabled={false}
                onRemove={noop}
                onClear={noop}
            />
        );
        const [source, target] = (["source", "target"] as const).map((variant, i) => (
            <PatchPromptSection
                key={variant}
                variant={variant}
                mode={floating ? "floating" : "field"}
                label={variant === "source" ? "Source" : "Target"}
                prompt={prompts[i]}
                setPrompt={noop}
                tokens={[]}
                selectedModel=""
                isEditing
                setIsEditing={noop}
            />
        ));
        if (floating) {
            return (
                <FloatingToolComposer
                    title={title}
                    prompt={
                        <>
                            {source}
                            <div aria-hidden className="mx-4 border-t" />
                            {target}
                        </>
                    }
                    promptArea="own"
                    tools={patchTools}
                    runDisabled
                    onRun={noop}
                    actions={actions}
                />
            );
        }
        return (
            <>
                {header}
                <div className="flex flex-1 flex-col gap-4 overflow-auto p-3">
                    {source}
                    {target}
                    <div className="-my-1.5 flex items-center gap-1">{patchTools}</div>
                    <ToolRunButton tool={tool} busy={false} disabled />
                </div>
            </>
        );
    }

    const prompt = (
        <LensPromptEditor
            layout={floating ? "floating" : "panel"}
            editing
            prompt={prompts[0]}
            tokens={[]}
            loading={false}
            interactive
            textareaRef={textareaRef}
            tokenContainerRef={tokenContainerRef}
            onChange={noop}
            onKeyDown={noop}
            onBlur={noop}
            onEdit={noop}
        />
    );
    const params = (
        <LensParams
            topk={5}
            onTopkChange={noop}
            includeEntropy={false}
            onIncludeEntropyChange={noop}
            disabled={false}
        />
    );
    if (floating) {
        return (
            <FloatingToolComposer
                title={title}
                prompt={prompt}
                params={params}
                runDisabled
                onRun={noop}
                actions={actions}
            />
        );
    }
    return (
        <>
            {header}
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3">
                {prompt}
                {params}
                <ToolRunButton tool={tool} busy={false} disabled />
                <ToolRunButton.Shortcut />
            </div>
        </>
    );
};
