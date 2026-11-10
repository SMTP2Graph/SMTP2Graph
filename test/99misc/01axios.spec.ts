import { Readable } from 'stream';
import { AxiosAdapter, AxiosProgressEvent, AxiosProxyConfig, CanceledError } from 'axios';
import { expect } from 'chai';
import '../_config';
import { axiosUploadRequest, graphUrl, graphUserUrl } from '../../src/classes/Http';
import { msalRequestConfig } from '../../src/classes/MsalProxy';
import { axiosProxyConfig } from '../../src/classes/Config';

describe('Axios integration', function(){
    it('Builds fixed Graph URLs and encodes the mailbox', function(){
        expect(graphUserUrl('sender+tag@example.com', 'sendMail')).to.equal(
            'https://graph.microsoft.com/v1.0/users/sender%2Btag%40example.com/sendMail',
        );
    });

    it('Rejects absolute and out-of-base Graph URLs', function(){
        expect(()=>graphUrl('https://example.com/collect')).to.throw('Absolute Graph URLs are not allowed');
        expect(()=>graphUrl('/beta/users/example/sendMail')).to.throw('Absolute Graph URLs are not allowed');
        expect(()=>graphUrl('../beta/users/example/sendMail')).to.throw('Invalid Graph URL');
    });

    it('Propagates the configured proxy to MSAL requests', function(){
        const proxy: AxiosProxyConfig = {
            protocol: 'https',
            host: 'proxy.example.com',
            port: 8443,
            auth: {username: 'proxy-user', password: 'proxy-password'},
        };

        const config = axiosProxyConfig({host: 'proxy.example.com', port: 8443, protocol: 'https', username: 'proxy-user', password: 'proxy-password'});
        expect(config).to.deep.equal(proxy);
        expect(config?.auth?.password).to.equal('proxy-password').and.not.equal('proxy-user');

        expect(msalRequestConfig('https://login.microsoftonline.com/tenant/token', 'POST', {body: 'request'}, proxy)).to.deep.include({
            url: 'https://login.microsoftonline.com/tenant/token',
            method: 'POST',
            data: 'request',
            proxy,
        });
    });

    it('Aborts when an upload never starts', async function(){
        const adapter: AxiosAdapter = config=>new Promise((resolve, reject)=>{
            const signal = config.signal;
            if (!signal?.addEventListener) throw new Error('Expected Axios to provide an abort-capable signal');
            signal.addEventListener('abort', ()=>reject(new CanceledError()), {once: true});
        });

        await expect(axiosUploadRequest({url: 'https://graph.microsoft.com/v1.0/test', adapter}, {connect: 10, overall: 100}))
            .to.eventually.be.rejectedWith('Server did not respond within 10ms');
    });

    it('Keeps the overall timeout after upload progress starts', async function(){
        let progressCalled = false;
        const adapter: AxiosAdapter = config=>new Promise((resolve, reject)=>{
            const signal = config.signal;
            if (!signal?.addEventListener) throw new Error('Expected Axios to provide an abort-capable signal');
            signal.addEventListener('abort', ()=>reject(new CanceledError()), {once: true});
            config.onUploadProgress?.({loaded: 1, bytes: 1} as AxiosProgressEvent);
        });

        await expect(axiosUploadRequest({
            url: 'https://graph.microsoft.com/v1.0/test',
            onUploadProgress: ()=>progressCalled = true,
            adapter,
        }, {connect: 10, overall: 30})).to.eventually.be.rejectedWith('Failed to send message within 30ms');

        expect(progressCalled).to.equal(true);
    });

    it('Keeps streamed upload options and clears the connection timeout on progress', async function(){
        let progressCalled = false;
        const stream = Readable.from(['message']);
        const adapter: AxiosAdapter = async config=>{
            expect(config.data).to.equal(stream);
            expect(config.maxBodyLength).to.equal(1024);
            config.onUploadProgress?.({loaded: 1, bytes: 1} as AxiosProgressEvent);
            await new Promise(resolve=>setTimeout(resolve, 25));
            return {data: 'ok', status: 200, statusText: 'OK', headers: {}, config};
        };

        const response = await axiosUploadRequest({
            method: 'post',
            url: 'https://graph.microsoft.com/v1.0/test',
            data: stream,
            maxBodyLength: 1024,
            onUploadProgress: ()=>progressCalled = true,
            adapter,
        }, {connect: 10, overall: 100});

        expect(response.data).to.equal('ok');
        expect(progressCalled).to.equal(true);
    });
});
