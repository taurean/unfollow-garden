const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_DATABASE_ID', 'CLOUDFLARE_D1_TOKEN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
	console.error('db: missing required env vars: ' + missing.join(', '));
	process.exit(1);
}
