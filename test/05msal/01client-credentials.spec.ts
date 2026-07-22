import fs from 'fs';
import { X509Certificate } from 'crypto';
import { expect } from 'chai';
import {
    ConfidentialClientApplication,
    INetworkModule,
    NetworkRequestOptions,
    NetworkResponse,
    NodeAuthOptions,
} from '@azure/msal-node';
import { MsalProxy } from '../../src/classes/MsalProxy';

const clientId = '00000000-0000-0000-0000-000000000001';
const tenant = 'test-tenant';
const authorityHost = 'login.microsoftonline.com';
const authority = `https://${authorityHost}/${tenant}`;
const tokenEndpoint = `${authority}/oauth2/v2.0/token`;
const graphScope = 'https://graph.microsoft.com/.default';
const accessToken = 'test-access-token';

const authorityMetadata = JSON.stringify({
    authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
    token_endpoint: tokenEndpoint,
    issuer: `${authority}/v2.0`,
    jwks_uri: `${authority}/discovery/v2.0/keys`,
});

const cloudDiscoveryMetadata = JSON.stringify({
    tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`,
    metadata: [{
        preferred_network: authorityHost,
        preferred_cache: authorityHost,
        aliases: [authorityHost],
    }],
});

class FakeNetworkModule implements INetworkModule
{
    readonly postRequests: {url: string, options?: NetworkRequestOptions}[] = [];

    async sendGetRequestAsync<T>(url: string): Promise<NetworkResponse<T>>
    {
        throw new Error(`Unexpected GET request: ${url}`);
    }

    async sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>
    {
        this.postRequests.push({url, options});

        return {
            headers: {'content-type': 'application/json'},
            body: {
                token_type: 'Bearer',
                scope: graphScope,
                expires_in: 3600,
                ext_expires_in: 3600,
                access_token: accessToken,
            } as unknown as T,
            status: 200,
        };
    }
}

function createClient(networkClient: INetworkModule, credentials: Pick<NodeAuthOptions, 'clientSecret'|'clientCertificate'>)
{
    return new ConfidentialClientApplication({
        auth: {
            clientId,
            authority,
            authorityMetadata,
            cloudDiscoveryMetadata,
            ...credentials,
        },
        system: {networkClient},
    });
}

function tokenRequestBody(networkClient: FakeNetworkModule): URLSearchParams
{
    expect(networkClient.postRequests).to.have.length(1);
    const request = networkClient.postRequests[0];
    const requestUrl = new URL(request.url);
    expect(requestUrl.origin + requestUrl.pathname).to.equal(tokenEndpoint);
    expect(request.options?.body).to.be.a('string');
    return new URLSearchParams(request.options?.body);
}

describe('MSAL client credentials', function(){
    it('Acquires an access token with a client secret', async function(){
        const networkClient = new FakeNetworkModule();
        const client = createClient(networkClient, {clientSecret: 'test-client-secret'});

        const result = await client.acquireTokenByClientCredential({scopes: [graphScope]});
        const body = tokenRequestBody(networkClient);

        expect(result?.accessToken).to.equal(accessToken);
        expect(body.get('client_id')).to.equal(clientId);
        expect(body.get('client_secret')).to.equal('test-client-secret');
        expect(body.get('grant_type')).to.equal('client_credentials');
        expect(body.get('scope')).to.equal(graphScope);
    });

    it('Acquires an access token with the existing SHA-1 certificate configuration', async function(){
        const networkClient = new FakeNetworkModule();
        const certificate = new X509Certificate(fs.readFileSync('test/localhost.crt'));
        const thumbprint = certificate.fingerprint.replace(/:/g, '');
        const privateKey = fs.readFileSync('test/localhost.key', 'utf8');
        const client = createClient(networkClient, {clientCertificate: {thumbprint, privateKey}});

        const result = await client.acquireTokenByClientCredential({scopes: [graphScope]});
        const body = tokenRequestBody(networkClient);
        const assertion = body.get('client_assertion');

        expect(result?.accessToken).to.equal(accessToken);
        expect(body.get('client_secret')).to.equal(null);
        expect(assertion).to.be.a('string').and.not.empty;
        if (!assertion) throw new Error('MSAL did not generate a client assertion');

        const header = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url').toString()) as {x5t?: string};
        expect(header.x5t).to.equal(Buffer.from(thumbprint, 'hex').toString('base64url'));
    });

    it('Reuses an in-memory client credential token', async function(){
        const networkClient = new FakeNetworkModule();
        const client = createClient(networkClient, {clientSecret: 'test-client-secret'});

        const first = await client.acquireTokenByClientCredential({scopes: [graphScope]});
        const second = await client.acquireTokenByClientCredential({scopes: [graphScope]});

        expect(first?.accessToken).to.equal(accessToken);
        expect(second?.accessToken).to.equal(accessToken);
        expect(networkClient.postRequests).to.have.length(1);
    });

    it('Rejects missing credentials', function(){
        expect(()=>createClient(new FakeNetworkModule(), {})).to.throw('invalid_client_credential');
    });

    it('Rejects conflicting client secret and certificate credentials', function(){
        const privateKey = fs.readFileSync('test/localhost.key', 'utf8');

        expect(()=>createClient(new FakeNetworkModule(), {
            clientSecret: 'test-client-secret',
            clientCertificate: {thumbprint: '00112233445566778899AABBCCDDEEFF00112233', privateKey},
        })).to.throw('invalid_client_credential');
    });

    it('Keeps MsalProxy structurally compatible with INetworkModule', function(){
        const networkClient: INetworkModule = new MsalProxy();

        expect(networkClient.sendGetRequestAsync).to.be.a('function');
        expect(networkClient.sendPostRequestAsync).to.be.a('function');
    });
});
