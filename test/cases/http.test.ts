import { assert } from 'chai';
import * as path from "path";
import { ServiceProto, TsrpcError, TsrpcErrorType } from 'tsrpc-proto';
import { TerminalColorLogger } from '../../src';
import { HttpClient } from '../../src/client/http/HttpClient';
import { HttpServer } from '../../src/server/http/HttpServer';
import { PrefixLogger } from '../../src/server/models/PrefixLogger';
import { ApiTest as ApiAbcTest } from '../api/a/b/c/ApiTest';
import { ApiTest } from '../api/ApiTest';
import { MsgChat } from '../proto/MsgChat';
import { serviceProto, ServiceType } from '../proto/serviceProto';

const serverLogger = new PrefixLogger({
    prefixs: ['[Server Log]'],
    logger: new TerminalColorLogger({ pid: 'Server' })
});
const clientLogger = new PrefixLogger({
    prefixs: ['[Client Log]'],
    logger: new TerminalColorLogger({ pid: 'Client' })
})

const getProto = () => Object.merge({}, serviceProto) as ServiceProto<ServiceType>;

async function testApi(server: HttpServer<ServiceType>, client: HttpClient<ServiceType>) {
    // Succ
    assert.deepStrictEqual(await client.callApi('Test', {
        name: 'Req1'
    }), {
        isSucc: true,
        res: {
            reply: 'Test reply: Req1'
        }
    });
    assert.deepStrictEqual(await client.callApi('a/b/c/Test', {
        name: 'Req2'
    }), {
        isSucc: true,
        res: {
            reply: 'a/b/c/Test reply: Req2'
        }
    });

    // Inner error
    for (let v of ['Test', 'a/b/c/Test']) {
        let ret = await client.callApi(v as any, {
            name: 'InnerError'
        });
        delete ret.err!.innerErr.stack;

        assert.deepStrictEqual(ret, {
            isSucc: false,
            err: new TsrpcError('Internal Server Error', {
                code: 'INTERNAL_ERR',
                type: TsrpcErrorType.ServerError,
                innerErr: `${v} InnerError`
            })
        });
    }

    // TsrpcError
    for (let v of ['Test', 'a/b/c/Test']) {
        let ret = await client.callApi(v as any, {
            name: 'TsrpcError'
        });
        assert.deepStrictEqual(ret, {
            isSucc: false,
            err: new TsrpcError(`${v} TsrpcError`, {
                code: 'CODE_TEST',
                type: TsrpcErrorType.ApiError,
                info: 'ErrInfo ' + v
            })
        });
    }

    // call.error
    for (let v of ['Test', 'a/b/c/Test']) {
        let ret = await client.callApi(v as any, {
            name: 'error'
        });
        assert.deepStrictEqual(ret, {
            isSucc: false,
            err: new TsrpcError('Got an error', {
                type: TsrpcErrorType.ApiError
            })
        });
    }
}

describe('HttpClient', function () {
    it('implement API manually', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger,
            debugBuf: true
        });
        await server.start();

        server.implementApi('Test', ApiTest);
        server.implementApi('a/b/c/Test', ApiAbcTest);

        let client = new HttpClient(getProto(), {
            logger: clientLogger,
            debugBuf: true
        })

        await testApi(server, client);

        await server.stop();
    })

    it('autoImplementApi', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger
        });
        await server.start();

        server.autoImplementApi(path.resolve(__dirname, '../api'))

        let client = new HttpClient(getProto(), {
            logger: clientLogger
        })

        await testApi(server, client);

        await server.stop();
    });

    it('sendMsg', async function () {
        let server = new HttpServer(getProto(), {
            port: 3001,
            logger: serverLogger,
            // debugBuf: true
        });

        await server.start();

        let client = new HttpClient(getProto(), {
            server: 'http://127.0.0.1:3001',
            logger: clientLogger,
            // debugBuf: true
        });

        return new Promise(rs => {
            let msg: MsgChat = {
                channel: 123,
                userName: 'fff',
                content: '666',
                time: Date.now()
            };

            server.listenMsg('Chat', async v => {
                assert.deepStrictEqual(v.msg, msg);
                await server.stop();
                rs();
            });

            client.sendMsg('Chat', msg);
        })
    })

    it('abort', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger
        });
        await server.start();

        server.autoImplementApi(path.resolve(__dirname, '../api'))

        let client = new HttpClient(getProto(), {
            logger: clientLogger
        })

        let result: any | undefined;
        let promise = client.callApi('Test', { name: 'aaaaaaaa' });
        let sn = client.lastSN;
        setTimeout(() => {
            client.abort(sn)
        }, 10);
        promise.then(v => {
            result = v;
        });

        await new Promise<void>(rs => {
            setTimeout(() => {
                assert.strictEqual(result, undefined);
                rs();
            }, 150)
        })

        await server.stop();
    });

    it('pendingApis', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger
        });
        await server.start();

        server.autoImplementApi(path.resolve(__dirname, '../api'))

        let client = new HttpClient(getProto(), {
            logger: clientLogger
        })

        for (let i = 0; i < 10; ++i) {
            let promise = Promise.all(Array.from({ length: 10 }, () => new Promise<void>(rs => {
                let name = ['Req', 'InnerError', 'TsrpcError', 'error'][Math.random() * 4 | 0];
                let ret: any | undefined;
                let promise = client.callApi('Test', { name: name });
                let sn = client.lastSN;
                let abort = Math.random() > 0.5;
                if (abort) {
                    setTimeout(() => {
                        client.abort(sn)
                    }, 0);
                }
                promise.then(v => {
                    ret = v;
                });

                setTimeout(() => {
                    client.logger?.log('sn', sn, name, abort, ret)
                    if (abort) {
                        assert.strictEqual(ret, undefined);
                    }
                    else {
                        assert.notEqual(ret, undefined);
                        if (name === 'Req') {
                            assert.strictEqual(ret.isSucc, true);
                        }
                        else {
                            assert.strictEqual(ret.isSucc, false)
                        }
                    }
                    rs();
                }, 300)
            })));
            assert.strictEqual(client['_pendingApis'].length, 10);
            await promise;
            assert.strictEqual(client['_pendingApis'].length, 0);
        }

        await server.stop();
    })

    it('error', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger
        });
        await server.start();

        let client1 = new HttpClient(getProto(), {
            server: 'http://localhost:80',
            logger: clientLogger
        })

        let ret = await client1.callApi('Test', { name: 'xx' });
        console.log(ret);
        assert.strictEqual(ret.isSucc, false);
        assert.strictEqual(ret.err?.code, 'ECONNREFUSED');
        assert.strictEqual(ret.err?.type, TsrpcErrorType.NetworkError);

        await server.stop();
    })

    it('server timeout', async function () {
        let server = new HttpServer(getProto(), {
            logger: serverLogger,
            apiTimeout: 100
        });
        server.implementApi('Test', call => {
            return new Promise(rs => {
                setTimeout(() => {
                    call.req && call.succ({
                        reply: 'Hi, ' + call.req.name
                    });
                    rs();
                }, 200)
            })
        })
        await server.start();

        let client = new HttpClient(getProto(), {
            logger: clientLogger
        });
        let ret = await client.callApi('Test', { name: 'Jack' });
        assert.deepStrictEqual(ret, {
            isSucc: false,
            err: new TsrpcError('Server Timeout', {
                code: 'SERVER_TIMEOUT',
                type: TsrpcErrorType.ServerError
            })
        });

        await server.stop();
    });

    it('client timeout', async function () {
        let server1 = new HttpServer(getProto(), {
            logger: serverLogger
        });
        server1.implementApi('Test', call => {
            return new Promise(rs => {
                setTimeout(() => {
                    call.succ({
                        reply: 'Hello, ' + call.req.name
                    });
                    rs();
                }, 2000)
            })
        })
        await server1.start();

        let client = new HttpClient(getProto(), {
            timeout: 100,
            logger: clientLogger
        });

        let ret = await client.callApi('Test', { name: 'Jack123' });
        // SERVER TIMEOUT的call还没执行完，但是call却被放入Pool了，导致这个BUG
        assert.deepStrictEqual(ret, {
            isSucc: false,
            err: new TsrpcError({
                message: 'Request Timeout',
                code: 'TIMEOUT',
                type: TsrpcErrorType.NetworkError
            })
        });
        await server1.stop();
    });
})