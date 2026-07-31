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
import { CONSISTENCY_CHECKERS } from '@/virtualEditor/checkers/consistency'
import { READABILITY_CHECKERS } from '@/virtualEditor/checkers/readability'
import { COPY_EDITING_CHECKERS } from '@/virtualEditor/checkers/copyEditing'

export const ALL_CHECKERS: Checker[] = [
  ...PROOFREADING_CHECKERS,
  ...CONSISTENCY_CHECKERS,
  ...READABILITY_CHECKERS,
  ...COPY_EDITING_CHECKERS,
]
