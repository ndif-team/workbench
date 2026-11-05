import type { TDocumentDefinitions } from "pdfmake/interfaces";

type PdfMake = typeof import("pdfmake/build/pdfmake");

let loading: Promise<PdfMake> | null = null;

/** A CommonJS module's exports, however the bundler wrapped them. */
function interop<T>(mod: T | { default: T }): T {
    return mod && typeof mod === "object" && "default" in mod
        ? (mod as { default: T }).default
        : (mod as T);
}

/** pdfmake with its fonts — Roboto (its bundled default) for text and the
 *  standard Courier for code — loaded on first use; it's ~1.6 MB. */
function loadPdfMake(): Promise<PdfMake> {
    loading ??= (async () => {
        const [pdfMakeModule, vfsModule, courierModule] = await Promise.all([
            import("pdfmake/build/pdfmake"),
            import("pdfmake/build/vfs_fonts"),
            import("pdfmake/build/standard-fonts/Courier"),
        ]);
        const pdfMake = interop(pdfMakeModule);
        pdfMake.addVirtualFileSystem(interop(vfsModule));
        pdfMake.addFontContainer(interop(courierModule));
        return pdfMake;
    })();
    loading.catch(() => {
        loading = null;
    });
    return loading;
}

/** Build the PDF in the browser and download it as `fileName`. */
export async function downloadPdf(
    definition: TDocumentDefinitions,
    fileName: string,
): Promise<void> {
    const pdfMake = await loadPdfMake();
    await pdfMake.createPdf(definition).download(fileName);
}
