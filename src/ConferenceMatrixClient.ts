import { IStorageProvider, IdentityClient, MatrixClient } from "matrix-bot-sdk";
import { IConfig } from "./config";

export class ConferenceMatrixClient extends MatrixClient {
    static async create(confConfig: IConfig, storage?: IStorageProvider) {
        let idClient: IdentityClient|undefined;
        if (confConfig.idServerDomain) {
            idClient = await new MatrixClient(confConfig.homeserverUrl, confConfig.accessToken).getIdentityServerClient(confConfig.idServerDomain);
            await idClient.acceptAllTerms();
            if (confConfig.idServerBrand) {
                idClient.brand = confConfig.idServerBrand;
            }
        }
        return new ConferenceMatrixClient(confConfig.homeserverUrl, confConfig.accessToken, idClient, confConfig.managementRoom, storage);
    }

    constructor(
        homeserverUrl: string,
        accessToken: string,
        public readonly identityClient: IdentityClient|undefined,
        public readonly managementRoom: string,
        storage?: IStorageProvider) {
        super(homeserverUrl, accessToken, storage);
    }
}