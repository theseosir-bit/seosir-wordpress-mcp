import type {Request,Response,NextFunction} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {createRemoteJWKSet, jwtVerify} from 'jose';

export type AuthContext = {subject:string; scopes:Set<string>};
declare global {
  namespace Express {
    interface Request { authContext?: AuthContext }
  }
}

const env = process.env.APP_ENV ?? 'development';
const publicUrl = process.env.PUBLIC_MCP_URL ?? '';
const metadataUrl = publicUrl ? new URL('/.well-known/oauth-protected-resource', publicUrl).toString() : '';
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function equalTokens(a:string,b:string):boolean {
  const left=Buffer.from(a); const right=Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}

export function validateAuthConfig() {
  if (!publicUrl || !publicUrl.startsWith('https://')) throw new Error('PUBLIC_MCP_URL must be an HTTPS URL');
  if (env === 'production') {
    for (const key of ['OAUTH_ISSUER','OAUTH_JWKS_URL','OAUTH_AUDIENCE','OAUTH_ALLOWED_SUB']) {
      if (!process.env[key]) throw new Error(`Required production configuration missing: ${key}`);
    }
    if (process.env.DEV_BEARER_TOKEN) throw new Error('Remove DEV_BEARER_TOKEN in production');
    if (process.env.OAUTH_AUDIENCE !== publicUrl) throw new Error('OAUTH_AUDIENCE must match PUBLIC_MCP_URL');
    jwks = createRemoteJWKSet(new URL(process.env.OAUTH_JWKS_URL!));
  } else {
    const devToken = process.env.DEV_BEARER_TOKEN ?? '';
    if (devToken.length < 32 || devToken.startsWith('replace-')) throw new Error('Set a strong DEV_BEARER_TOKEN (32+ characters)');
    const host=process.env.HOST ?? '127.0.0.1';
    if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
      throw new Error('Development mode MUST bind to loopback only');
    }
  }
}

export function protectedResourceMetadata() {
  return {
    resource: publicUrl,
    authorization_servers: process.env.OAUTH_ISSUER ? [process.env.OAUTH_ISSUER] : [],
    scopes_supported: ['wordpress:read','wordpress:write'],
    bearer_methods_supported: ['header']
  };
}

export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const bearer = /^Bearer (\S+)$/i.exec(req.header('authorization') ?? '')?.[1];
    const challenge = `Bearer resource_metadata="${metadataUrl}", scope="wordpress:read wordpress:write"`;
    if (!bearer) {
      res.set('WWW-Authenticate',challenge).status(401).json({error:'Bearer token required'});return;
    }
    try {
      if (env !== 'production') {
        if (!equalTokens(bearer,process.env.DEV_BEARER_TOKEN ?? '')) throw new Error('Invalid dev token');
        req.authContext = {subject:'local-developer',scopes:new Set(['wordpress:read','wordpress:write'])};
      } else {
        if (!jwks) throw new Error('JWKS not initialized');
        const {payload}=await jwtVerify(bearer,jwks,{
          issuer:process.env.OAUTH_ISSUER,
          audience:process.env.OAUTH_AUDIENCE,
          algorithms:['RS256','ES256']
        });
        const subject = payload.sub;
        if (typeof subject !== 'string' || !subject || subject !== process.env.OAUTH_ALLOWED_SUB) {
          throw new Error('Unknown principal');
        }
        const rawScopes=typeof payload.scope==='string' ? payload.scope.split(/\s+/) : [];
        const scopes=new Set(rawScopes);
        if (!scopes.has('wordpress:read')) throw new Error('Missing read scope');
        req.authContext = {subject,scopes};
      }
      next();
    } catch {
      res.set('WWW-Authenticate',challenge).status(401).json({error:'Invalid access token or insufficient scope'});
    }
  };
}
