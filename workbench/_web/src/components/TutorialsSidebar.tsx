import { Button } from "@/components/ui/button";
import { useTour } from "@reactour/tour";
import { useState, useEffect } from "react";
import { LogitLensTutorial } from "@/tutorials/lens";
import { ArrowLeft, X, ChevronLeft, ChevronRight } from "lucide-react";
import { renderTextWithBackticks } from "@/components/providers/TourProvider";

interface TutorialsSidebarProps {
  onClose: () => void;
}

interface TourDescriptionProps {
  onBack: () => void;
  onStartChapter: (chapterIndex: number) => void;
}

function TourDescription({ onBack, onStartChapter }: TourDescriptionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
          <ArrowLeft size={16} />
        </Button>
        <h3 className="font-semibold">
          {LogitLensTutorial.chapters[0] ? "Logit Lens" : "Tutorial"}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {LogitLensTutorial.description}
      </p>
      <div className="flex flex-col gap-3">
        {LogitLensTutorial.chapters.map((chapter, index) => (
          <div key={index} className="flex flex-row justify-between items-center p-3">
            <div>
              <span className="font-medium text-sm">{chapter.title}</span>
              <p className="text-xs text-muted-foreground">{chapter.steps.length} steps</p>
            </div>
            <Button
              size="sm"
              onClick={() => onStartChapter(index)}
              variant="outline"
              className="h-8"
            >
              Start
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourStepContent({ onBack }: { onBack: () => void }) {
  const { currentStep, steps, setCurrentStep, meta } = useTour();
  const [sidebarContent, setSidebarContent] = useState<string | null>(null);

  // Update sidebar content when current step has selector "sidebar"
  useEffect(() => {
    if (steps && steps[currentStep] && steps[currentStep].selector === "sidebar") {
      const content = steps[currentStep].content;
      if (typeof content === "string") {
        setSidebarContent(content);
      }
    }
  }, [currentStep, steps]);

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < steps.length - 1;

  const handlePrevStep = () => {
    if (canGoPrev) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNextStep = () => {
    if (canGoNext) {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
          <ArrowLeft size={16} />
        </Button>
        <h3 className="font-semibold">{meta || "Tutorial"}</h3>
      </div>

      {/* Step Progress */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>

      {/* Step Content */}
      {sidebarContent && <div className="text-sm">{renderTextWithBackticks(sidebarContent)}</div>}

      {/* Navigation Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevStep}
          disabled={!canGoPrev}
          className="flex items-center gap-1"
        >
          <ChevronLeft size={14} />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextStep}
          disabled={!canGoNext}
          className="flex items-center gap-1"
        >
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function TutorialsSidebar({ onClose }: TutorialsSidebarProps) {
  const { setSteps, setIsOpen, setMeta, currentStep, steps, isOpen } = useTour();
  const [showTourDescription, setShowTourDescription] = useState(false);
  const [showTourStepContent, setShowTourStepContent] = useState(false);

  // Check if we should show step content
  useEffect(() => {
    if (isOpen && steps && steps.length > 0) {
      setShowTourStepContent(true);
      setShowTourDescription(false);
    } else {
      setShowTourStepContent(false);
    }
  }, [isOpen, steps]);

  const handleStartChapter = (chapterIndex: number) => {
    const chapter = LogitLensTutorial.chapters[chapterIndex];
    if (chapter && setSteps) {
      setSteps(chapter.steps);
      if (setIsOpen) {
        setIsOpen(true);
      }
      if (setMeta) {
        setMeta(chapter.title);
      }
    }
  };

  const handleTourClick = () => {
    setShowTourDescription(true);
  };

  const handleBack = () => {
    setShowTourDescription(false);
    setShowTourStepContent(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">
          {showTourStepContent
            ? "Tutorial"
            : showTourDescription
              ? "Logit Lens Tutorial"
              : "Tutorials"}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X size={16} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {showTourStepContent ? (
          <TourStepContent onBack={handleBack} />
        ) : !showTourDescription ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground mb-4">
              Learn about the interface with interactive tutorials.
            </p>
            <div
              className="flex flex-row justify-between items-center border rounded p-3 cursor-pointer hover:bg-muted/50 transition-colors duration-200"
              onClick={handleTourClick}
            >
              <div>
                <span className="font-medium">Logit Lens</span>
                <p className="text-xs text-muted-foreground">
                  Walk through an example of Logit Lens.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <TourDescription onBack={handleBack} onStartChapter={handleStartChapter} />
        )}
      </div>
    </div>
  );
}
