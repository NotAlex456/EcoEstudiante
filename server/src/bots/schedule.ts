import type { Config } from '../config'

/** Programa la respuesta de un bot en una conversación. (Se completa en la Task 5.) */
export async function scheduleBotReply(_config: Config, _conversationId: string, _botId: string): Promise<void> {}

/** Programa que el bot vendedor confirme un acuerdo. (Se completa en la Task 5.) */
export async function scheduleBotConfirm(_config: Config, _agreementId: string): Promise<void> {}
