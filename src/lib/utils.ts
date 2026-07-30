import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names safely, resolving conflicting utility
 * classes in favour of the last one specified.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
