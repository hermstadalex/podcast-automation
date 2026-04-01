import axios from 'axios';

async function parse() {
    const res = await axios.get('https://docs.captivate.fm/api/collections/9051302/SVtSVpdW');
    
    // Traverse the Postman Collection JSON structure recursively
    function findCreateEpisode(items: any[]): any {
        for (const item of items) {
            if (item.name === 'Create Episode' && item.request?.method === 'POST') {
                return item;
            }
            if (item.item) {
                const found = findCreateEpisode(item.item);
                if (found) return found;
            }
        }
        return null;
    }

    const endpoint = findCreateEpisode(res.data.collection.item);
    if (endpoint && endpoint.request && endpoint.request.body && endpoint.request.body.formdata) {
        console.log("Create Episode EXPECTED FORM/BODY PROPERTIES:");
        endpoint.request.body.formdata.forEach((p: any) => {
            console.log(`- ${p.key} (${p.type || 'text'})`);
        });
    } else {
        console.log("Could not parse 'Create Episode' properties in Postman schema");
        console.log(JSON.stringify(endpoint, null, 2));
    }
}
parse().catch(console.error);
