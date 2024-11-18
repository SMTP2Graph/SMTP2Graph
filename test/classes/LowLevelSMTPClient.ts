import { createConnection, Socket } from 'node:net';
import { randomUUID } from 'node:crypto';

export class LowLevelSMTPClient
{
    constructor(public server: string, public port: number)
    {

    }

    async sendMail(from: string, rcptTo: string, headers: Record<string, string>, data: string): Promise<string>
    {
        // Add a messageId
        headers['Message-ID'] ??= randomUUID().toString();

        const socket = await this.#connect();
        await this.#read(socket); // Wait for hello from server
        await this.#writeRead(socket, `HELO ${this.server}\r\n`);
        await this.#writeRead(socket, `MAIL FROM: <${from}>\r\n`);
        await this.#writeRead(socket, `RCPT TO: <${rcptTo}>\r\n`);
        await this.#writeRead(socket, `DATA\r\n`);
        for(const [key, val] of Object.entries(headers))
            socket.write(`${key}: ${val}\r\n`);
        await this.#writeRead(socket, `\r\n${data}\r\n.\r\n`);
        socket.destroy();

        return headers['Message-ID'];
    }

    #connect(): Promise<Socket>
    {
        return new Promise<Socket>((resolve, reject)=>{
            const socket = createConnection(this.port, this.server);
            socket.on('error', reject);
            socket.once('connect', ()=>{
                socket.off('connect', reject);
                resolve(socket);
            });
        });
    }

    async #writeRead(socket: Socket, data: string): Promise<string>
    {
        socket.write(data);
        const response = (await this.#read(socket, 2000)).toString();

        if(/^[23]\d{2} /.test(response)) // We got a 200/300 response?
            return response;
        else // No 200/300 response, then we throw an error
            throw new Error(response);
    }

    #read(socket: Socket, timeout: number = 5000): Promise<Buffer>
    {
        const dataPromise = new Promise<Buffer>((resolve, reject)=>{
            socket.once('data', resolve);
        });
        const dataTimeout = new Promise<Buffer>((resolve, reject)=>setTimeout(()=>reject(`Time-out. No data after ${timeout}ms`), timeout))

        return Promise.race([dataPromise, dataTimeout]);
    }
}

export default LowLevelSMTPClient;
