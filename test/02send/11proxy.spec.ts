import http from 'http';
import net from 'net';
import { expect } from 'chai';
import { config } from '../_config';
import { Server } from '../classes/Server';
import { submitAndVerifyMail } from './Helpers';

describe('Send: Over HTTP proxy', async function(){
    const server = new Server({
        mode: 'full',
        send: {
            appReg: {
                id: config.clientId,
                tenant: config.clientTenant,
                secret: config.clientSecret,
            },
        },
        httpProxy: {
            host: '127.0.0.1',
            port: 3000,
        },
    });
    let httpServer: http.Server | undefined;
    const proxiedHosts: string[] = [];

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    before('Start proxy server', async function(){
        await expect(new Promise<void>((resolve,reject)=>{
            httpServer = http.createServer();

            // All requests (MSAL and Graph) are HTTPS, which Axios tunnels using CONNECT
            httpServer.on('connect', (req, clientSocket, head)=>{
                const { hostname, port } = new URL(`https://${req.url}`);
                proxiedHosts.push(`https://${hostname}`); // Keep track of requests send over the proxy

                const serverSocket = net.connect(Number(port) || 443, hostname, ()=>{
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    if(head.length) clientSocket.unshift(head); // Forward any data that came in with the CONNECT request
                    serverSocket.pipe(clientSocket);
                    clientSocket.pipe(serverSocket);
                });
                serverSocket.on('error', ()=>clientSocket.destroy());
                clientSocket.on('error', ()=>serverSocket.destroy());
            });

            httpServer.listen(3000, undefined, undefined, resolve);
        })).to.eventually.be.fulfilled;
    });

    after('Stop server', async function(){
        await server.stop();
    });

    after('Stop proxy server', async function(){
        httpServer?.close();
    });

    it('Send message', async function(){
        await submitAndVerifyMail({
            mail: {
                subject: `TEST: ${this.test?.title}`,
                text: 'Some mail contents',
            },
        });

        expect(proxiedHosts, 'Authentication(MSAL) wasn\'t send over the proxy').to.include('https://login.microsoftonline.com');
        expect(proxiedHosts, 'Mail wasn\'t send over the proxy').to.include('https://graph.microsoft.com');
    });

});
