import { ApiServiceDef, MsgServiceDef, ServiceProto } from "../proto/ServiceProto";

/** A utility for generate `ServiceMap` */
export class ServiceMapUtil {
    static getServiceMap(proto: ServiceProto, side: 'server' | 'client'): ServiceMap {
        let map: ServiceMap = {
            id2Service: {},
            localApi: {},
            remoteApi: {},
            msg: {}
        }

        for (let v of proto.services) {
            let match = v.name.match(/(.+\/)?([^\/]+)$/)!;
            let path = match[1] || '';
            let name = match[2];
            if (v.type === 'api') {
                let svc: ApiService = {
                    ...v,
                    reqSchemaId: `${path}Ptl${name}/Req${name}`,
                    resSchemaId: `${path}Ptl${name}/Res${name}`,
                }
                if (svc.side === 'both' || svc.side === side) {
                    map.localApi[v.name] = svc;
                }
                if (svc.side === 'both' || svc.side !== side) {
                    map.remoteApi[v.name] = svc;
                }
                map.id2Service[v.id] = svc;
            }
            else {
                let svc: MsgService = {
                    ...v,
                    msgSchemaId: `${path}Msg${name}/Msg${name}`,
                };
                map.msg[v.name] = svc;
                map.id2Service[v.id] = svc;
            }
        }

        return map;
    }
}

export interface ServiceMap {
    id2Service: { [serviceId: number]: ApiService | MsgService },
    /** API which implemented at local, and called by the remote */
    localApi: ApiMap,
    /** API which implemented at remote, and called by the local */
    remoteApi: ApiMap,
    msg: { [msgName: string]: MsgService | undefined }
}

export type ApiMap<T extends string = string> = { [apiName in T]: ApiService | undefined };

export interface ApiService extends ApiServiceDef {
    reqSchemaId: string,
    resSchemaId: string
}

export interface MsgService extends MsgServiceDef {
    msgSchemaId: string
}