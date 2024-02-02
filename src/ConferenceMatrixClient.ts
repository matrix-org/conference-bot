import { FunctionCallContext, IStorageProvider, IdentityClient, METRIC_IDENTITY_CLIENT_FAILED_FUNCTION_CALL, METRIC_IDENTITY_CLIENT_SUCCESSFUL_FUNCTION_CALL, METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL, METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL, MatrixClient } from "matrix-bot-sdk";
import { IConfig } from "./config";
import { Counter } from "prom-client";

const matrixApiCalls = new Counter({ name: "matrix_api_calls", help: "The number of Matrix client API calls made.", labelNames: ["method"]});
const matrixApiCallsFailed = new Counter({ name: "matrix_api_calls_failed", help: "The number of Matrix client API calls which failed.", labelNames: ["method"]});
const matrixIdentityApiCalls = new Counter({ name: "matrix_identity_api_calls", help: "The number of Matrix identity API calls made.", labelNames: ["method"]});
const matrixIdentityApiCallsFailed = new Counter({ name: "matrix_identity_api_calls_failed", help: "The number of Matrix identity API calls which failed.", labelNames: ["method"]});


export class ConferenceMatrixClient extends MatrixClient {
    static async create(confConfig: IConfig, storage?: IStorageProvider) {
        let idClient: IdentityClient|undefined;
        if (confConfig.idServerDomain) {
            const client = new MatrixClient(confConfig.homeserverUrl, confConfig.accessToken);
            client.impersonateUserId(confConfig.userId);
            idClient = await client.getIdentityServerClient(confConfig.idServerDomain);
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
            this.metrics.registerListener({
                onStartMetric: () => {
                    // Not used yet.
                },
                onEndMetric: () => {
                    // Not used yet.
                },
                onIncrement: (metricName, context) => {
                    if (metricName === METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL) {
                        const ctx = context as FunctionCallContext;
                        matrixApiCalls.inc({method: ctx.functionName});
                    }
                    if (metricName === METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL) {
                        const ctx = context as FunctionCallContext;
                        matrixApiCallsFailed.inc({method: ctx.functionName});
                    }
                    if (metricName === METRIC_IDENTITY_CLIENT_SUCCESSFUL_FUNCTION_CALL) {
                        const ctx = context as FunctionCallContext;
                        matrixIdentityApiCalls.inc({method: ctx.functionName});
                    }
                    if (metricName === METRIC_IDENTITY_CLIENT_FAILED_FUNCTION_CALL) {
                        const ctx = context as FunctionCallContext;
                        matrixIdentityApiCallsFailed.inc({method: ctx.functionName});
                    }
                },
                onDecrement: () => {
                    // Not used yet.
                },
                onReset: (metricName) => {
                    if (metricName === METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL) {
                        matrixApiCalls.reset();
                    }
                    if (metricName === METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL) {
                        matrixApiCallsFailed.reset();
                    }
                },
            })
    }
}