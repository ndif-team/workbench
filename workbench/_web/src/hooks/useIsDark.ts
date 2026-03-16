import { useTheme } from "next-themes";

export function useIsDark() {
    const { resolvedTheme } = useTheme();
    return resolvedTheme === "dark";
}
