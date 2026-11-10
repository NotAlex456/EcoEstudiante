import 'dotenv/config'
import http from 'node:http'
import { createApp } from './app'
import { startBotWorker } from './bots/worker'
import { loadConfig } from './config'
import { createNotifier } from './notify/notify'
import { createRealtime } from './realtime/socket'

const config = loadConfig(process.env)
// Express y Socket.IO comparten el mismo servidor HTTP (y el mismo puerto).
const server = http.createServer()
const realtime = createRealtime(server, config)
const notifier = createNotifier(realtime)
server.on('request', createApp(config, { realtime, notifier }))
if (config.botsEnabled) startBotWorker({ config, realtime, notifier })

server.listen(config.port, () => {
  console.log(`EcoEstudiante API escuchando en http://localhost:${config.port}`)
})
