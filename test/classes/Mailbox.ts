import 'dotenv/config';
import axios from 'axios';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Message } from '@microsoft/microsoft-graph-types';
import { config } from '../_config';

export class Mailbox
{
    static #tenantOrId = /^[0-9a-f]{8}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i.test(config.clientTenant)?config.clientTenant:`${config.clientTenant}.onmicrosoft.com`;
    static #msalClient = new ConfidentialClientApplication({
        auth: {
            authority: `https://login.microsoftonline.com/${Mailbox.#tenantOrId}`,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
        },
    });

    static async fetchMessageByMsgId(msgId: string): Promise<Message | undefined>
    {
        const token = await this.#aquireToken();

        const res = await axios<{value?: Message[]}>({
            url: `https://graph.microsoft.com/v1.0/users/${config.mailbox}/messages?$filter=internetMessageId eq '${msgId}'&$expand=Attachments&$top=1`,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        return res.data.value?.[0];
    }

    static async #aquireToken(): Promise<string>
    {
        const res = await this.#msalClient.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });
        return res?.accessToken!;
    }

}
