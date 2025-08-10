"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAnnotations } from "@/stores/useAnnotations";
import { useWorkspace } from "@/stores/useWorkspace";
import { getAnnotations } from "@/lib/queries/annotationQueries";
import { useCreateAnnotation, useDeleteAnnotation } from "@/lib/api/annotationsApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { X, CircleDot, Layers, Grid3X3 } from "lucide-react";
import type { LineAnnotation, HeatmapAnnotation, AnnotationData } from "@/types/annotations";
import { NewAnnotation } from "@/db/schema";

export function AnnotationsDisplay() {
    const { pendingAnnotation, setPendingAnnotation } = useAnnotations();
    const { activeTab } = useWorkspace();
    const [annotationText, setAnnotationText] = useState("");

    const { mutate: createAnnotation, isPending: isCreating } = useCreateAnnotation();
    const { mutate: deleteAnnotation } = useDeleteAnnotation();

    const { data: annotations = [] } = useQuery({
        queryKey: ["annotations", activeTab],
        queryFn: () => getAnnotations(activeTab as string),
        enabled: !!activeTab,
    });

    useEffect(() => {
        setPendingAnnotation(null);
        setAnnotationText("");
    }, [activeTab, setPendingAnnotation]);

    const handleSaveAnnotation = () => {
        if (!pendingAnnotation || !annotationText.trim() || !activeTab) return;

        const newAnnotation: NewAnnotation = {
            chartId: activeTab,
            type: pendingAnnotation.type,
            data: {
                ...pendingAnnotation,
                text: annotationText.trim(),
            },
        };

        createAnnotation(newAnnotation, {
            onSuccess: () => {
                setPendingAnnotation(null);
                setAnnotationText("");
            },
        }
        );
    };

    const handleCancelAnnotation = () => {
        setPendingAnnotation(null);
        setAnnotationText("");
    };

    const handleDeleteAnnotation = (id: string) => {
        if (!activeTab) return;
        deleteAnnotation({ id, chartId: activeTab });
    };

    const formatAnnotationDetails = (type: string, data: AnnotationData) => {
        console.log(data)
        console.log("ANNOTATIONS", annotations)
        if (type === "line") {
            const lineData = data as LineAnnotation;
            if (lineData.layerEnd !== undefined) {
                return `Layers ${lineData.layerStart}-${lineData.layerEnd}`;
            }
            return `Layer ${lineData.layerStart}`;
        } else if (type === "heatmap") {
            const heatmapData = data as HeatmapAnnotation;
            return `Cells: ${heatmapData.cellIds.length}`;
        }
        return "";
    };

    const getAnnotationIcon = (type: string) => {
        switch (type) {
            case "line":
                return <Layers className="h-4 w-4" />;
            case "heatmap":
                return <Grid3X3 className="h-4 w-4" />;
            default:
                return <CircleDot className="h-4 w-4" />;
        }
    };

    return (
        <>
            <div className="h-12 px-3 py-2 border-b items-center flex" data-testid="annotations-header">
                Annotations
            </div>

            <div className="flex flex-col h-full p-2">


                {pendingAnnotation && (
                    <Card className="p-4 mb-2 rounded" data-testid="pending-annotation-card">
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                                    {getAnnotationIcon(pendingAnnotation.type)}
                                    <span className="capitalize">{pendingAnnotation.type} Annotation</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {formatAnnotationDetails(pendingAnnotation.type, pendingAnnotation)}
                                </p>
                            </div>

                            <Textarea
                                placeholder="Enter your annotation..."
                                value={annotationText}
                                onChange={(e) => setAnnotationText(e.target.value)}
                                className="min-h-[80px]"
                                data-testid="annotation-textarea"
                                aria-label="Annotation Text"
                            />

                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleSaveAnnotation}
                                    disabled={!annotationText.trim() || isCreating}
                                    className="flex-1"
                                    data-testid="annotation-save"
                                    aria-label="Save Annotation"
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelAnnotation}
                                    disabled={isCreating}
                                    className="flex-1"
                                    data-testid="annotation-cancel"
                                    aria-label="Cancel Annotation"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                <ScrollArea className="flex-1">
                    <div className="space-y-2">
                        {annotations.length === 0 && !pendingAnnotation && (
                            <div className="text-center py-8 text-muted-foreground" data-testid="annotations-empty">
                                <p className="text-sm">No annotations yet</p>
                                <p className="text-xs mt-1">Click on the chart to add annotations</p>
                            </div>
                        )}

                        {annotations.map((annotation) => (
                            <Card key={annotation.id} className="p-3 rounded" data-testid={`annotation-item-${annotation.id}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {getAnnotationIcon(annotation.type)}
                                            <span className="text-sm font-medium capitalize">
                                                {annotation.type}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatAnnotationDetails(annotation.type, annotation.data)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground/90 break-words">
                                            {annotation.data.text}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 flex-shrink-0"
                                        onClick={() => handleDeleteAnnotation(annotation.id)}
                                        data-testid={`annotation-delete-${annotation.id}`}
                                        aria-label={`Delete annotation ${annotation.id}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}