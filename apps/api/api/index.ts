import type { IncomingMessage, ServerResponse } from 'http'
import { buildApp } from '../src/app'

let appReady: ReturnType<typeof buildApp> | null = null

async function getApp() {
  if (!appReady) {
    appReady = buildApp()
  }
  return appReady
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  await app.ready()
  app.server.emit('request', req, res)
}