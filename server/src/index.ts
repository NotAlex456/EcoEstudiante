import 'dotenv/config'
import { createApp } from './app'
import { loadConfig } from './config'

const config = loadConfig(process.env)
const app = createApp(config)

app.listen(config.port, () => {
  console.log(`EcoEstudiante API escuchando en http://localhost:${config.port}`)
})
