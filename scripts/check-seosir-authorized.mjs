// Read-only authenticated checks. Do not paste any secret into chat.
// On Mac/Linux: read -r -p 'Username: ' WP_USERNAME; read -rs -p 'App password: ' WP_APPLICATION_PASSWORD; echo; export WP_USERNAME WP_APPLICATION_PASSWORD
// On Windows PowerShell use the manual REST checker in README; avoid storing secrets in shell history.
const username = process.env.WP_USERNAME;
const password = process.env.WP_APPLICATION_PASSWORD;
if (!username || !password) { console.error('Missing WP_USERNAME / WP_APPLICATION_PASSWORD'); process.exit(2); }
const auth = Buffer.from(`${username}:${password}`).toString('base64');
let failed = false;
for (const path of ['/wp-json/wp/v2/users/me?context=edit', '/wp-json/ai-bridge/v1/capabilities']) {
  try {
    const response = await fetch('https://seosir.ir'+path, {
      headers:{'Authorization':`Basic ${auth}`,'Accept':'application/json'},
      redirect:'error', signal:AbortSignal.timeout(12000)
    });
    let body;
    try {body = await response.json();} catch {body = null;}
    if (!response.ok) {
      failed = true;
      console.log(`${path}: HTTP ${response.status}; code=${String(body?.code ?? 'not_json')}`);
    } else if (path.includes('users/me')) {
      console.log(`${path}: OK; user_id=${body?.id}; roles=${JSON.stringify(body?.roles ?? [])}`);
    } else {
      console.log(`${path}: OK; yoast_active=${body?.yoast_active}; elementor_active=${body?.elementor_active}; elementor_writes_enabled=${body?.elementor_writes_enabled}`);
    }
  } catch (err) {failed = true; console.log(`${path}: FAIL ${err.message}`);}
}
if (failed) process.exitCode=1;
