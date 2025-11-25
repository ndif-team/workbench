import { useRef, useEffect } from "react";
import React from "react";

interface PrintableCanvasImgProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const PrintableCanvasImg = ({ canvasRef: heatmapCanvasRef }: PrintableCanvasImgProps) => {
    const printImgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const handleBeforePrint = () => {
            // We need refs because the src has to be updated synchronously
            const canvas = heatmapCanvasRef?.current;
            const printImg = printImgRef?.current;

            if (canvas && printImg) {
                const url = canvas.toDataURL("image/png", 1.0);
                console.log("Canvas img url: " + url);
                printImg.src = url;
            }
        };

        window.addEventListener("beforeprint", handleBeforePrint);

        return () => {
            window.removeEventListener("beforeprint", handleBeforePrint);
        };
        // We ONLY want this to run once, on mount: empty array
        // https://reactjs.org/docs/hooks-effect.html
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <img
            src={undefined}
            alt="Printable chart"
            className="hidden w-full h-auto mx-auto print:block"
            ref={printImgRef}
        />
    );
};
