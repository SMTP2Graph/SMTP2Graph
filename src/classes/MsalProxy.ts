import { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node";
import axios, { AxiosRequestConfig } from "axios";
import { Config } from "./Config";
import { HttpsProxyAgent } from 'https-proxy-agent';

export class MsalProxy implements INetworkModule {
    sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
        return this.#sendRequestAsync(url, 'GET', options);
    }

    sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
        return this.#sendRequestAsync(url, 'POST', options);
    }

    async #sendRequestAsync<T>(url: string, method: 'GET' | 'POST', options: NetworkRequestOptions = {}): Promise<NetworkResponse<T>> {
        let proxyAgent;
        if (Config.httpProxyConfig) {
            const { protocol, host, port, auth } = Config.httpProxyConfig;
            const authPart = auth ? `${encodeURIComponent(auth.username)}:${encodeURIComponent(auth.password)}@` : '';
            proxyAgent = new HttpsProxyAgent(`${protocol}://${authPart}${host}:${port}`);
        }

        const requestConfig: AxiosRequestConfig = {
            url,
            method: method,
            headers: options.headers,
            data: options.body,
            httpsAgent: proxyAgent,
            httpAgent: proxyAgent,
            proxy: false,
        };

        const response = await axios(requestConfig);

        return {
            headers: response.headers as any,
            body: response.data,
            status: response.status,
        };
    }
}
