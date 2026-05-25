import 'reflect-metadata'

import { dataSource } from './database/typeorm/data-source.js'
import { CheckoutPublisher, createChannel } from './messaging/checkout-queue.js'
import { server } from './server.js'

async function startServer() {
  await dataSource.initialize()

  const { channel } = await createChannel()
  const publisher = new CheckoutPublisher(channel)

  const app = server(publisher)

  const port = Number(process.env.PORT) || 3333
  const host = process.env.HOST ?? '0.0.0.0'

  app.listen({ port, host }, (err, address) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }

    app.log.info(`Server listening at ${address}`)
  })
}

void startServer()
