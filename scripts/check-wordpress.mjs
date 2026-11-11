// Run with Node 20+ after setting WP_URL, WP_USERNAME, WP_APPLICATION_PASSWORD.
// Read-only, no new content created.
const url=(process.env.WP_URL??'').replace(/\/+$/,'');
const username=process.env.WP_USERNAME;
const password=process.env.WP_APPLICATION_PASSWORD;
if(!url||!username||!password) {
  console.error('Missing WP_URL / WP_USERNAME / WP_APPLICATION_PASSWORD');
  process.exit(2);
}
const headers={Authorization:'Basic '+Buffer.from(`${username}:${password}`).toString('base64'),Accept:'application/json'};
for(const endpoint of ['/wp-json/wp/v2/users/me','/wp-json/ai-bridge/v1/capabilities']) {
  try {
    const response=await fetch(url+endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
    const payload=await response.json();
    if(!response.ok) {
      console.error('FAIL',endpoint,response.status,payload?.code??'unknown');process.exitCode=1;
    } else {
      console.log('OK',endpoint,JSON.stringify(payload).slice(0,700));
    }
  } catch(err) { console.error('FAIL',endpoint,err.message);process.exitCode=1; }
}
