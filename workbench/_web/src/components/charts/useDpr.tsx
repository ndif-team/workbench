import { useLayoutEffect } from "react";

export const useDpr = (canvasRef: React.RefObject<HTMLCanvasElement>, onResize?: () => void) => {
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const update = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onResize) onResize();
    };

    const ro = new ResizeObserver(update);
    ro.observe(canvas);

    let mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onDprChange = () => {
      update();
      mq.removeEventListener("change", onDprChange);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener("change", onDprChange);
    };
    mq.addEventListener("change", onDprChange);

    update();
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onDprChange);
    };
  }, [canvasRef, onResize]);
};
