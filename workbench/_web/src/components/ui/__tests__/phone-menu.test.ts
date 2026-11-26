import { afterEach, describe, expect, it } from "bun:test";
import { PhoneMenu } from "../phone-menu";

/** A trigger whose box spans `top` to `bottom` on the screen. */
const trigger = (top: number, bottom: number) =>
    ({ getBoundingClientRect: () => ({ top, bottom }) }) as unknown as HTMLElement;

/** A screen `height` tall that is a phone's width, or not. */
function screen(phone: boolean, height = 844) {
    (globalThis as { window?: unknown }).window = {
        innerHeight: height,
        matchMedia: (query: string) => ({ matches: phone && query === PhoneMenu.QUERY }),
    };
}

describe("PhoneMenu.side", () => {
    afterEach(() => {
        delete (globalThis as { window?: unknown }).window;
    });

    it("opens upward on a phone when the room below is short and there is more above", () => {
        screen(true);
        expect(PhoneMenu.side(trigger(560, 592))).toBe("top");
    });

    it("stays below when the menu fits there", () => {
        screen(true);
        expect(PhoneMenu.side(trigger(100, 132))).toBe("bottom");
        expect(PhoneMenu.side(trigger(560, 592), "bottom", PhoneMenu.roomFor(3, 96))).toBe(
            "bottom",
        );
    });

    it("stays below when there is no more room above", () => {
        screen(true, 400);
        expect(PhoneMenu.side(trigger(150, 182))).toBe("bottom");
    });

    it("keeps the preferred side off a phone, and for a menu that opens upward", () => {
        screen(false);
        expect(PhoneMenu.side(trigger(560, 592))).toBe("bottom");
        screen(true);
        expect(PhoneMenu.side(trigger(100, 132), "top")).toBe("top");
        expect(PhoneMenu.side(null)).toBe("bottom");
    });
});

describe("PhoneMenu.roomFor", () => {
    it("counts a menu's rows up to the ones it shows before it scrolls", () => {
        expect(PhoneMenu.roomFor(3, 96)).toBe(3 * PhoneMenu.ROW_HEIGHT + 96);
        expect(PhoneMenu.roomFor(40, 0)).toBe(PhoneMenu.ROWS_SHOWN * PhoneMenu.ROW_HEIGHT);
    });
});
