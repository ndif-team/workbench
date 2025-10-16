// import { useState } from "react";
// import { Button } from "@/components/ui/button";
// import { BookOpen } from "lucide-react";
// import {
//     Dialog,
//     DialogContent,
//     DialogDescription,
//     DialogFooter,
//     DialogHeader,
//     DialogTitle,
// } from "@/components/ui/dialog";
// import { useModels } from "@/hooks/useModels";
// import { useLensWorkspace } from "@/stores/useLensWorkspace";
// import { useCharts } from "@/stores/useCharts";
// import { useAnnotations } from "@/stores/useAnnotations";

// interface TutorialsToggleProps {
//     tutorialsOpen: boolean;
//     toggleTutorials: () => void;
// }

// export function TutorialsToggle({ tutorialsOpen, toggleTutorials }: TutorialsToggleProps) {
//     const [isDialogOpen, setIsDialogOpen] = useState(false);
//     const { completions } = useLensWorkspace();
//     const { isLoading: isModelsLoading } = useModels();
//     const { clearGridPositions } = useCharts();
//     const { setAnnotations } = useAnnotations();

//     const clearWorkspace = () => {
//         if (isModelsLoading) return;

//         const { setActiveCompletions } = useLensWorkspace.getState();
//         setActiveCompletions([]);
//         clearGridPositions();
//         setAnnotations([]);
//     };

//     const handleTutorialToggle = () => {
//         console.log("completions", completions.length);

//         if (tutorialsOpen) {
//             toggleTutorials();
//             return;
//         }

//         if (completions.length > 0) {
//             setIsDialogOpen(true);
//         } else {
//             toggleTutorials();
//         }
//     };

//     const handleDialogConfirm = () => {
//         clearWorkspace();
//         setIsDialogOpen(false);
//         toggleTutorials();
//     };

//     return (
//         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
//             <Button
//                 variant="outline"
//                 className="h-8 text-xs"
//                 onClick={handleTutorialToggle}
//             >
//                 <BookOpen size={16} />
//                 Tutorials
//             </Button>
//             <DialogContent className="max-w-xs">
//                 <DialogHeader>
//                     <DialogTitle>Open Tutorials</DialogTitle>
//                     <DialogDescription>
//                         You have existing completions. Opening the tutorials will clear
//                         them.
//                     </DialogDescription>
//                 </DialogHeader>
//                 <DialogFooter>
//                     <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
//                         Cancel
//                     </Button>
//                     <Button onClick={handleDialogConfirm}>Open Tutorials</Button>
//                 </DialogFooter>
//             </DialogContent>
//         </Dialog>
//     );
// }
