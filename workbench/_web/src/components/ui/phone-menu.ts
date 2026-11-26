/**
 * A menu's size and place on a phone. A menu keeps most of a phone's width,
 * so its contents are sized for the thumb and the eye there, not as on a
 * desktop: under `md:` (where the composers' controls are their touch size
 * too) a row is 44px tall with 16px text, and its icon, check, headings,
 * tabs, search field and footer step up with it. From `md:` up none of this
 * applies and a menu keeps the size its own classes give it.
 *
 * Every menu's parts take these classes: the primitives (`dropdown-menu`,
 * `select`, `pill-popover`) and the hand-built lists (`ModelPopover`). A new
 * menu adds them beside its desktop classes.
 */
export class PhoneMenu {
    /** The widths these sizes apply at; the `max-md:` variant in the classes. */
    static readonly QUERY = "(max-width: 767px)";

    /** A row: an option or an action, with its text. */
    static readonly ROW = "max-md:min-h-11 max-md:gap-3 max-md:text-base";
    /** A row's sides where the menu's rows run edge to edge. */
    static readonly ROW_INSET = "max-md:px-4";
    /** The sides of such a row when a 2px rule marks it as the selected one. */
    static readonly ROW_INSET_MARKED = "max-md:pl-3.5 max-md:pr-4";
    /** A row's label where it sets its own size. */
    static readonly TEXT = "max-md:text-base";
    /** A monospace label (a model's name): a step under the rows' text, as
     *  it is on a desktop. */
    static readonly MONO = "max-md:text-sm";
    /** Secondary text beside a label, and a group's heading. */
    static readonly NOTE = "max-md:text-sm";
    /** A row's icon and its check, set on the icon itself. */
    static readonly ICON = "max-md:size-5";
    static readonly CHECK = "max-md:size-4";
    /** A status dot. */
    static readonly DOT = "max-md:size-2.5";
    /** A tab over the rows. */
    static readonly TAB = "max-md:h-9 max-md:px-3 max-md:text-sm";
    /** A search field over the rows; 16px also keeps iOS from zooming into it. */
    static readonly SEARCH = "max-md:px-4 max-md:py-3";
    static readonly SEARCH_INPUT = "max-md:text-base";
    /** A link under the rows. */
    static readonly FOOTER = "max-md:min-h-11 max-md:px-4 max-md:text-sm";
    /** A menu of actions: the fixed width its host gives it fits desktop text. */
    static readonly WIDTH = "max-md:min-w-64";

    /** A row's height, and the most rows a menu shows before it scrolls. */
    static readonly ROW_HEIGHT = 44;
    static readonly ROWS_SHOWN = 6;
    /** The room a long menu needs: its rows, with a heading, tabs or a footer. */
    static readonly ROOM = 320;

    /** The room a menu of `rows` rows needs, with `chrome` pixels of
     *  headings, search field and padding around them. */
    static roomFor(rows: number, chrome: number): number {
        return Math.min(rows, PhoneMenu.ROWS_SHOWN) * PhoneMenu.ROW_HEIGHT + chrome;
    }

    /**
     * The side of `trigger` a menu opens on. Off a phone, and for a menu
     * that prefers the top, it is `preferred`. On a phone a menu opens upward
     * instead when the room under its trigger is less than it needs (`room`)
     * and there is more above: its rows are tall there, and a trigger low on
     * the screen (Home's pickers) would leave it a few of them. Decided as
     * the menu opens, so an open menu never changes sides.
     */
    static side(
        trigger: HTMLElement | null,
        preferred: "top" | "bottom" = "bottom",
        room: number = PhoneMenu.ROOM,
    ): "top" | "bottom" {
        if (!trigger || preferred === "top") return preferred;
        if (!window.matchMedia(PhoneMenu.QUERY).matches) return preferred;
        const { top, bottom } = trigger.getBoundingClientRect();
        const below = window.innerHeight - bottom;
        return below < room && top > below ? "top" : "bottom";
    }
}
