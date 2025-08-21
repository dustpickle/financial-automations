declare module "ssh2" {
  export class Server {
    constructor(opts: { hostKeys: Array<string | Buffer> }, onClient?: (client: unknown) => void)
    listen(port: number, host?: string, cb?: () => void): void
  }

  export interface Client {
    on(event: "authentication", cb: (ctx: ClientAuthenticationContext) => void): void
    on(event: "ready", cb: () => void): void
    on(event: "session", cb: (accept: () => Session) => void): void
    accountId?: string
    accountRoot?: string
  }

  export interface ClientAuthenticationContext {
    method: string
    username: string
    password?: string
    reject(methods?: string[]): void
    accept(): void
  }

  export interface Session {
    on(event: "sftp", cb: (accept: () => SFTPStream) => void): void
  }

  export interface SFTPStream {
    on(event: "REALPATH", cb: (reqid: number, path: string) => void): void
    on(event: "OPENDIR", cb: (reqid: number, path: string) => void): void
    on(event: "READDIR", cb: (reqid: number, handle: Buffer) => void): void
    on(event: "STAT", cb: (reqid: number, path: string) => void): void
    on(event: "LSTAT", cb: (reqid: number, path: string) => void): void
    on(event: "OPEN", cb: (reqid: number, filename: string, flags: number, attrs?: unknown) => void): void
    on(event: "READ", cb: (reqid: number, handle: Buffer, offset: number, length: number) => void): void
    on(event: "WRITE", cb: (reqid: number, handle: Buffer, offset: number, data: Buffer) => void): void
    on(event: "CLOSE", cb: (reqid: number, handle: Buffer) => void): void
    on(event: "SETSTAT", cb: (reqid: number, path: string, attrs?: unknown) => void): void
    on(event: "FSETSTAT", cb: (reqid: number, handle: Buffer, attrs?: unknown) => void): void
    on(event: "MKDIR", cb: (reqid: number, path: string, attrs?: unknown) => void): void
    on(event: "REMOVE", cb: (reqid: number, path: string) => void): void
    on(event: "RMDIR", cb: (reqid: number, path: string) => void): void
    on(event: "ERROR", cb: (err: unknown) => void): void
    
    status(reqid: number, code: number): void
    handle(reqid: number, handle: Buffer): void
    data(reqid: number, data: Buffer): void
    name(reqid: number, names: Array<{ filename: string; longname: string; attrs: unknown }>): void
    attrs(reqid: number, attrs: { mode: number; size: number; atime: number; mtime: number }): void
  }

  export interface Stats {
    isDirectory(): boolean
    size: number
    atimeMs: number | bigint
    mtimeMs: number | bigint
  }
}
