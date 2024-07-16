import http from 'http';
import httpProxy from 'http-proxy';
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
    const proxy = httpProxy.createProxyServer();
    const proxiedHosts: string[] = [];

    before('Start server', async function(){
        await expect(server.start(), 'Failed to start SMTP server').to.eventually.be.fulfilled;
    });

    before('Start proxy server', async function(){
        await expect(new Promise<void>((resolve,reject)=>{
            httpServer = http.createServer((req, res)=>{
                if(!req.url) return;
                const url = new URL(req.url);
                proxiedHosts.push(url.origin); // Keep track of requests send over the proxy
                proxy.web(req, res, {target: url.origin});
            }).listen(3000, undefined, undefined, resolve);
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
