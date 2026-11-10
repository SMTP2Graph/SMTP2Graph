import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

const graphBaseUrl = new URL('https://graph.microsoft.com/v1.0/');

export interface IRequestTimeouts
{
    connect: number;
    overall: number;
}

/** Build a URL below the fixed Microsoft Graph v1.0 endpoint. */
export function graphUrl(path: string): string
{
    if(/^([a-z][a-z\d+.-]*:)?\/\//i.test(path) || path.startsWith('/'))
        throw new Error('Absolute Graph URLs are not allowed');

    const url = new URL(path, graphBaseUrl);
    if(url.origin !== graphBaseUrl.origin || !url.pathname.startsWith(graphBaseUrl.pathname))
        throw new Error('Invalid Graph URL');

    return url.toString();
}

export function graphUserUrl(user: string, endpoint: string): string
{
    return graphUrl(`users/${encodeURIComponent(user)}/${endpoint}`);
}

/** Send an Axios request with separate connection and overall upload timeouts. */
export async function axiosUploadRequest<RequestData = any, ResponseData = any>(
    request: AxiosRequestConfig<RequestData>,
    timeouts: IRequestTimeouts = {connect: 10000, overall: 120000},
): Promise<AxiosResponse<ResponseData, RequestData>>
{
    const abortController = new AbortController();
    const connectTimeout = setTimeout(()=>abortController.abort(new Error(`Server did not respond within ${timeouts.connect}ms`)), timeouts.connect);
    const overallTimeout = setTimeout(()=>abortController.abort(new Error(`Failed to send message within ${timeouts.overall}ms`)), timeouts.overall);
    const onUploadProgress = request.onUploadProgress;

    try {
        return await axios<ResponseData, AxiosResponse<ResponseData, RequestData>, RequestData>({
            ...request,
            signal: abortController.signal,
            onUploadProgress: progress=>{
                clearTimeout(connectTimeout);
                onUploadProgress?.(progress);
            },
        });
    } catch(error) {
        if(axios.isCancel(error) && abortController.signal.aborted)
            throw abortController.signal.reason;
        throw error;
    } finally {
        clearTimeout(connectTimeout);
        clearTimeout(overallTimeout);
    }
}
