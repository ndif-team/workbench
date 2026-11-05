// pdfmake ships its standard (built-in PDF) fonts as font containers that
// @types/pdfmake doesn't declare.
declare module "pdfmake/build/standard-fonts/Courier" {
    import type { TFontContainer } from "pdfmake/interfaces";
    const fontContainer: TFontContainer;
    export = fontContainer;
}
