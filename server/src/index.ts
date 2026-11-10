import 'dotenv/config'
import http from 'node:http'
import { createApp } from './app'
import { startBotWorker } from './bots/worker'
import { loadConfig } from './config'
import { createPushSender } from './integrations/push'
import { createNotifier } from './notify/notify'
import { createRealtime } from './realtime/socket'

const config = loadConfig(process.env)
// Express y Socket.IO comparten el mismo servidor HTTP (y el mismo puerto).
const server = http.createServer()
const realtime = createRealtime(server, config)
const push = createPushSender(config)
const notifier = createNotifier({ realtime, push })
server.on('request', createApp(config, { realtime, notifier, push }))
console.log(push.mode === 'firebase' ? 'Push: Firebase activo' : 'Push: desactivado (falta FIREBASE_SERVICE_ACCOUNT)')
if (config.botsEnabled) startBotWorker({ config, realtime, notifier })

server.listen(config.port, () => {
  console.log(`EcoEstudiante API escuchando en http://localhost:${config.port}`)
})
