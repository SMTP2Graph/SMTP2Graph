import fs from 'fs';
import readline from 'readline';
import { Mutex, Semaphore } from 'async-mutex';
import axios, { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { Base64Encode } from 'base64-stream';
import addressparser from 'nodemailer/lib/addressparser';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Config, IAccount } from './Config';
import { UnrecoverableError } from './Constants';
import { MsalProxy } from './MsalProxy';

export class MailboxAccessDenied extends UnrecoverableError { }
export class InvalidMailContent extends UnrecoverableError { }
export class MessageSizeExceeded extends UnrecoverableError { }

export class Mailer
{
    /** Prevent getting an accesstoken in parallel */
    static #aquireTokenMutex = new Mutex();
    /** Prevent sending more than 4 messages in parallel (see: https://learn.microsoft.com/en-us/graph/throttling-limits#outlook-service-limits) */
    static #sendSemaphore = new Semaphore(4);

    static #msalClients = new Map<string, ConfidentialClientApplication>();

    static #getClient(account: IAccount): ConfidentialClientApplication
    {
        let client = this.#msalClients.get(account.name);
        if(!client)
        {
            const certKeyPath = account.appReg.certificate?.privateKeyPath;
            const certKey = certKeyPath && fs.existsSync(certKeyPath)
                ? fs.readFileSync(certKeyPath).toString()
                : undefined;

            const tenantId = account.appReg.tenant;
            const authority = /^[0-9a-f]{8}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i.test(tenantId)
                ? `https://login.microsoftonline.com/${tenantId}`
                : `https://login.microsoftonline.com/${tenantId}.onmicrosoft.com`;

            client = new ConfidentialClientApplication({
                auth: {
                    authority,
                    clientId: account.appReg.id,
                    clientSecret: account.appReg.secret,
                    clientCertificate: account.appReg.certificate ? {
                        thumbprint: account.appReg.certificate.thumbprint,
                        privateKey: certKey!,
                    } : undefined,
                },
                system: Config.httpProxyConfig ? {networkClient: new MsalProxy()} : undefined,
            });

            this.#msalClients.set(account.name, client);
        }
        return client;
    }

    static async sendEml(filePath: string, account: IAccount)
    {
        return this.#sendSemaphore.runExclusive(async ()=>{
            // Determine the sender
            let sender = account.forceMailbox;
            if(!sender) // There's no forced sender in the config, so we get it from the mail data
            {
                const senderObj = await this.#findSender(filePath);
                if(!senderObj) throw new UnrecoverableError('No sender/from address defined');
                sender = senderObj.address;
            }

            // Fetch an accesstoken if needed
            const token = await this.#aquireToken(account);

            // Send the message
            const readStream = fs.createReadStream(filePath);
            try {
                await this.#retryableRequest({
                    method: 'post',
                    url: `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
                    data: readStream.pipe(new Base64Encode()),
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'text/plain',
                        'User-Agent': `SMPT2Graph/${VERSION}`,
                    },
                    proxy: Config.httpProxyConfig,
                });
            } catch(error: any) {
                if(isAxiosError(error) && error.response?.data)
                {
                    const data = error.response?.data;
                    if('error' in data && 'code' in data.error)
                    {
                        if(data.error.code === 'ErrorAccessDenied')
                            throw new MailboxAccessDenied(`Access to mailbox "${sender}" denied`);
                        else if(data.error.code === 'ErrorMimeContentInvalidBase64String')
                            throw new InvalidMailContent(`Invalid content for mail "${filePath}"`);
                        else if(data.error.code === 'ErrorMessageSizeExceeded')
                            throw new MessageSizeExceeded(`The message exceeds the maximum supported size for mail "${filePath}"`);
                        else
                            throw new Error(JSON.stringify(data.error));
                    }
                    else
                        throw data;
                }
                else
                    throw error;
            } finally {
                readStream.destroy();
            }
        });
    }

    /** Automatically retry a request when it's being throttled by the Graph API */
    static async #retryableRequest<RequestData = any, ReponseData = any>(request: AxiosRequestConfig<RequestData>): Promise<AxiosResponse<RequestData, ReponseData>>
    {
        const retryLimit = 3;
        let retryCount = 0;
        let wait = 200;

        const retry = async (): Promise<AxiosResponse<RequestData, ReponseData>> =>
        {
            const abortController = new AbortController();
            const connectTimeout = setTimeout(()=>abortController.abort(`Server did not respond within 10 seconds`), 10000);
            const overallTimeout = setTimeout(()=>abortController.abort(`Failed to send message within 120 seconds`), 120000);

            try {
                return await axios({
                    ...request,
                    signal: abortController.signal,
                    onUploadProgress: progress=>{
                        clearTimeout(connectTimeout);
                    },
                });
            } catch(error) {
                if(++retryCount > retryLimit) // We've reached our retry limit?
                    throw error;
                else if(isAxiosError(error) && (error.response?.status === 429 || error.response?.status === 503 || error.response?.status === 504)) // We got a retryable response?
                {
                    const retryAfter = error.response.headers['Retry-After'];
                    if(retryAfter && !isNaN(retryAfter)) // We got throttled
                        wait = parseInt(retryAfter) * 1000;
                    else
                        wait *= 2;

                    await this.#sleep(wait);

                    return retry();
                }
                else if(axios.isCancel(error) && abortController.signal.aborted)
                    throw abortController.signal.reason;
                else // Unknown error response, throw the error
                    throw error;
            } finally {
                clearTimeout(connectTimeout);
                clearTimeout(overallTimeout);
            }
        };

        return retry();
    }

    static #sleep(ms: number): Promise<void>
    {
        return new Promise(r=>setTimeout(r, ms));
    }

    /** Get sender address from EML/RFC822 data */
    static async #findSender(filePath: string)
    {
        const readStream = fs.createReadStream(filePath);
        const reader = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity, // To treat \r\n and \n the same
        });

        for await(const line of reader)
        {
            if(line === '') // We've reached the end of the headers?
                break;
            else if(line.toLowerCase().startsWith('sender:') || line.toLowerCase().startsWith('from:')) // Found the sender?
            {
                const parsed = addressparser(line.substring(line.indexOf(':')+1), {flatten: true});
                if(parsed.length && parsed[0].address) // We got an address?
                {
                    readStream.destroy();
                    return parsed[0];
                }
            }
        }

        readStream.destroy();
    }

    static async #aquireToken(account: IAccount): Promise<string>
    {
        return this.#aquireTokenMutex.runExclusive(async ()=>{
            const client = this.#getClient(account);
            const res = await client.acquireTokenByClientCredential({
                scopes: ['https://graph.microsoft.com/.default'],
            });
            return res?.accessToken!;
        });
    }

    /** Test if we can acquire a token for the given account (used by health dashboard) */
    static async testConnection(account: IAccount): Promise<{ok: boolean, error?: string}>
    {
        try {
            await this.#aquireToken(account);
            return {ok: true};
        } catch(error: any) {
            return {ok: false, error: String(error)};
        }
    }

}
