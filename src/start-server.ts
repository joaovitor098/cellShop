import { server } from "./server.js"

function startServer() {
    const app = server()

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

startServer()