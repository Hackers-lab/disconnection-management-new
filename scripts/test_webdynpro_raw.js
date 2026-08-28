const cid = '300618202';
async function testWebDynpro() {
  const url = `https://portal.wbsedcl.in/webdynpro/resources/wbsedcl/noduesandoutstandingreport/OutstandingReport?consumerId=${cid}`;
  const firstRes = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  console.log('Status:', firstRes.status);
  console.log('Headers:', [...firstRes.headers.entries()]);
  const buf = Buffer.from(await firstRes.arrayBuffer());
  console.log('Buffer length:', buf.length);
  if (buf.length > 0) {
    console.log('Buffer hex preview:', buf.slice(0, 100).toString('utf-8'));
  }
}
testWebDynpro().catch(console.error);
