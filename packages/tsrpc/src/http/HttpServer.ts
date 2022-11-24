import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { ApiReturn, BaseConnectionDataType, BaseServiceType, ServiceProto } from "tsrpc-base";
import { BaseServer, BaseServerOptions, defaultBaseServerOptions } from "tsrpc-base-server";
import { getClassObjectId } from "../models/getClassObjectId";
import { processUncaughtException } from "../models/processUncaughtException";
import { TerminalColorLogger } from "../models/TerminalColorLogger";
import { TSRPC_VERSION } from "../models/version";
import { HttpServerConnection } from "./HttpServerConnection";

export class HttpServer<ServiceType extends BaseServiceType = any> extends BaseServer<ServiceType>{

    declare options: HttpServerOptions;
    declare $Conn: HttpServerConnection<ServiceType>;

    constructor(serviceProto: ServiceProto<ServiceType>, options?: Partial<HttpServerOptions>) {
        super(serviceProto, {
            ...defaultHttpServerOptions,
            ...options
        }, {
            classObjectId: getClassObjectId(),
            env: {
                tsrpc: TSRPC_VERSION,
                node: process.version
            }
        });
        processUncaughtException(this.logger);
    }

    /** Native `http.Server` of NodeJS */
    httpServer?: http.Server | https.Server;

    protected async _start(): Promise<void> {
        this.logger.log(`Starting ${this.options.https ? 'HTTPS' : 'HTTP'} server at port ${this.options.port} ...`);

        const requestListener = (req: IncomingMessage, res: ServerResponse) => {
            // Create Connection
            const conn = new HttpServerConnection(this, {
                httpReq: req,
                httpRes: res
            });
            this.addConnection(conn);
        }

        // Create Server
        if (this.options.https) {
            this.httpServer = https.createServer({ ...this.options.https }, requestListener)
        }
        else {
            this.httpServer = http.createServer({}, requestListener)
        }
    }

    protected _stop(): void {
        throw new Error("Method not implemented.");
    }

    // TODO
    // Proxy：从别处接收输入，灌给 Server，再监听 Server 输出，灌给 Source
    // HttpServerProxy.request
    // 事件函数
    // HTTP 函数
    inputJSON(apiName: string, req: object, options?: { headers?: Record<string, string>, ip?: string }) {
        // _recvBox
    }
    inputBuffer(buf: Uint8Array, ip?: string) {
        // _recvBox
    }

}

// TODO
export const defaultHttpServerOptions: HttpServerOptions = {
    ...defaultBaseServerOptions,
    logger: new TerminalColorLogger,
    returnInnerError: process.env['NODE_ENV'] !== 'production'
} as any;

export interface HttpServerOptions extends BaseServerOptions {
    /** Which port the HTTP server listen to */
    port: number,

    /**
     * ★ ONLY FOR WHEN `{json: true}` ★
     * Actual URL path is `${hostPath}/${apiName}`.
     * For example, if `jsonHostPath` is `'/api'`, then you can send `POST /api/a/b/c/Test` to call API `a/b/c/Test`.
     * @defaultValue `'/'`
     */
    jsonHostPath: string,

    /**
     * Default data type when header content-type is not set
     * @defaultValue text
     */
    defaultDataType: BaseConnectionDataType,

    /**
     * HTTPS options, the server would use https instead of http if this value is defined.
     * NOTICE: Once you enabled https, you CANNOT visit the server via `http://` anymore.
     * If you need visit the server via both `http://` and `https://`, you can start 2 HttpServer (one with `https` and another without).
     * @defaultValue `undefined`
     */
    https?: {
        /**
         * @example
         * fs.readFileSync('xxx-key.pem');
         */
        key: https.ServerOptions['key'],

        /**
         * @example
         * fs.readFileSync('xxx-cert.pem');
         */
        cert: https.ServerOptions['cert']
    },

    /** 
     * Passed to the `timeout` property to the native `http.Server` of NodeJS, in milliseconds.
     * `0` and `undefined` will disable the socket timeout behavior.
     * NOTICE: this `socketTimeout` be `undefined` only means disabling of the socket timeout, the `apiTimeout` is still working.
     * `socketTimeout` should always greater than `apiTimeout`.
     * @defaultValue `undefined`
     * @see {@link https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_server_timeout}
     */
    socketTimeout?: number,

    /**
     * Passed to the `keepAliveTimeout` property to the native `http.Server` of NodeJS, in milliseconds.
     * It means keep-alive timeout of HTTP socket connection.
     * @defaultValue 5000 (from NodeJS)
     * @see {@link https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_server_keepalivetimeout}
     */
    keepAliveTimeout?: number,

    /** 
     * Response header value of `Access-Control-Allow-Origin`.
     * If this has any value, it would also set `Access-Control-Allow-Headers` as `*`.
     * `undefined` means no CORS header.
     * @defaultValue `*`
     */
    cors?: string,

    /**
     * Response header value of `Access-Control-Allow-Origin`.
     * @defaultValue `3600`
     */
    corsMaxAge?: number,

    encodeReturnText?: (ret: ApiReturn<any>) => string,

    /**
     * When uncaught error throwed,
     * whether to return the original error as a property `innerErr`. 
     * (May include some sensitive information, suggests set to `false` in production environment.)
     * @defaultValue It depends on environment variable `NODE_ENV`.
     * If `NODE_ENV` equals to `production`, the default value is `false`, otherwise is `true`.
     */
    returnInnerError: boolean;

    // Deprecated
    /** @deprecated Use `json` instead */
    jsonEnabled?: never;
}