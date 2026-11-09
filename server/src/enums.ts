import type { Condition, Mode } from '@prisma/client'
import { CONDITIONS, MODES } from '../../shared/constants'

/** Textos que usa la app ↔ valores de enum en la base de datos. */
export type ModeLabel = (typeof MODES)[number]
export type ConditionLabel = (typeof CONDITIONS)[number]

const MODE: Record<ModeLabel, Mode> = { Venta: 'Venta', Intercambio: 'Intercambio', Donación: 'Donacion' }
const CONDITION: Record<ConditionLabel, Condition> = { 'Como nuevo': 'ComoNuevo', 'Buen estado': 'BuenEstado', Usado: 'Usado' }

const invert = <K extends string, V extends string>(o: Record<K, V>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<V, K>
const MODE_LABEL = invert(MODE)
const CONDITION_LABEL = invert(CONDITION)

export const toMode = (label: ModeLabel): Mode => MODE[label]
export const modeLabel = (mode: Mode): ModeLabel => MODE_LABEL[mode]
export const toCondition = (label: ConditionLabel): Condition => CONDITION[label]
export const conditionLabel = (condition: Condition): ConditionLabel => CONDITION_LABEL[condition]
