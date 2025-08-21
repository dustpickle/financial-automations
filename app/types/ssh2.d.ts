declare module "ssh2" {
  export class Server {
    constructor(opts: { hostKeys: string[] }, onClient?: (client: any) => void)
    listen(port: number, host?: string, cb?: () => void): void
  }
}
