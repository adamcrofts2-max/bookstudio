/**
 * Virtual Editor — checker registry.
 *
 * The single place `runPipeline` looks to find out which deterministic
 * checkers exist. Adding a new checker for another category (copy editing,
 * consistency, etc.) means writing a `Checker` and adding it here — the
 * pipeline and dashboard pick it up automatically.
 */

import type { Checker } from '@/virtualEditor/types'
import { PROOFREADING_CHECKERS } from '@/virtualEditor/checkers/proofreading'

export const ALL_CHECKERS: Checker[] = [...PROOFREADING_CHECKERS]
