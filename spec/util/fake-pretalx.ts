import { Server, createServer } from "http";
import { AddressInfo } from "net";
import { PretalxTalk } from "../../src/backends/pretalx/PretalxApiClient";
import { FOSDEMTalk } from "../../src/backends/pretalx/FOSDEMPretalxApiClient";

export async function fakePretalxServer({
    matrixTalks, pretalxTalks}: {matrixTalks?: FOSDEMTalk[],
        pretalxTalks?: PretalxTalk[]}
        ) {
    const server = await new Promise<Server>(resolve => { const server = createServer((req, res) => {
        if (req.url?.startsWith('/talks/?')) {
            res.writeHead(200);
            res.end(JSON.stringify({
                count: pretalxTalks?.length ?? 0,
                next: null,
                previous: null,
                results: pretalxTalks ?? [],
            }));
        } else if (req.url?.startsWith('/talks/')) {
            const talkCode = req.url.slice('/talks/'.length);
            const talk = pretalxTalks?.find(s => s.code === talkCode);
            if (talk) {
                res.writeHead(200);
                res.end(talk);
            } else {
                res.writeHead(404);
                res.end(`Talk "${talkCode}" not found`);
            }
        } else if (req.url === '/p/matrix/') {
            res.writeHead(200);
            res.end(JSON.stringify({talks: matrixTalks ?? []}));
        } else {
            console.log(req.url);
            res.writeHead(404);
            res.end("Not found");
        }
    }).listen(undefined, '127.0.0.1', undefined, () => {
        resolve(server);
    })});
    const address  = server.address() as AddressInfo;
    return {
        server,
        url: `http://${address.address}:${address.port}`,
    }
}