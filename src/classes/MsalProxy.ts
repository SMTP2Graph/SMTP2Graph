import { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node";
import axios, { AxiosProxyConfig, AxiosRequestConfig } from "axios";
import { Config } from "./Config";

export class MsalProxy implements INetworkModule
{
    sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>
    {
        return this.#sendRequestAsync(url, 'GET', options);
    }

    sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>
    {
        return this.#sendRequestAsync(url, 'POST', options);
    }

    async #sendRequestAsync<T>(url: string, method: 'GET' | 'POST', options: NetworkRequestOptions = {}): Promise<NetworkResponse<T>>
    {
        const response = await axios(msalRequestConfig(url, method, options));

        return {
            headers: response.headers as any,
            body: response.data,
            status: response.status,
        };
    }
}

export function msalRequestConfig(url: string, method: 'GET'|'POST', options: NetworkRequestOptions = {}, proxy: AxiosProxyConfig|undefined = Config.httpProxyConfig): AxiosRequestConfig
{
    return {
        url,
        method,
        headers: options.headers,
        data: options.body,
        proxy,
    };
}
