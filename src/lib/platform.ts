/** Platform detection helpers — cached at module load */

export const isMac = navigator.platform.toUpperCase().includes("MAC");

/** The primary modifier key for the current platform */
export const modKey = isMac ? "Cmd" : "Ctrl";

/** Display symbol: "⌘" on macOS, "Ctrl+" on Windows/Linux */
export const modSymbol = isMac ? "\u2318" : "Ctrl+";

/** Check if the platform modifier key is pressed (Cmd on mac, Ctrl on win/linux) */
export function isModKey(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}
