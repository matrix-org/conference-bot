import { IStorageProvider, IdentityClient, MatrixClient } from "matrix-bot-sdk";
import { IConfig } from "./config";

export class ConferenceMatrixClient extends MatrixClient {
    static async create(confConfig: IConfig, storage?: IStorageProvider) {
        const idClient = await new MatrixClient(confConfig.homeserverUrl, confConfig.accessToken).getIdentityServerClient(confConfig.idServerDomain);
        await idClient.acceptAllTerms();
        idClient.brand = confConfig.idServerBrand;      
        return new ConferenceMatrixClient(confConfig.homeserverUrl, confConfig.accessToken, idClient, storage);
    }

    constructor(homeserverUrl: string, accessToken: string, public readonly identityClient: IdentityClient, storage?: IStorageProvider) {
        super(homeserverUrl, accessToken, storage);
    }
}