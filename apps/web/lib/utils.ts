import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Compose class names and resolve Tailwind CSS class conflicts.
 *
 * @param inputs - Class values (strings, arrays, or objects) to be combined
 * @returns A single string of merged, deduplicated Tailwind-compatible class names
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}