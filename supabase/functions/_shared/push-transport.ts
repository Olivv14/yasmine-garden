// Pure WebCrypto library primitives: no node:crypto, global fetch overrides or library auto-send.
import { ApplicationServer, importVapidKeys } from 'jsr:@negrel/webpush@0.5.0';
import { encrypt } from 'jsr:@negrel/http-ece@0.7.0';
import { decodeKey,encodeKey,endpointURL } from '../../../push/protocol.mjs';
export type Subscription = {endpoint:string;p256dh:string;auth:string};
export type PushOutcome = 'accepted'|'retry'|'gone'|'rejected';
export type PushConfig = {publicKey:string;privateKey:string;contact:string};
export async function createPushSender(config:PushConfig, fetcher:typeof fetch=fetch) {
  const raw=decodeKey(config.publicKey,65); const privateRaw=decodeKey(config.privateKey,32);
  const publicJwk:JsonWebKey={kty:'EC',crv:'P-256',x:encodeKey(raw.slice(1,33)),y:encodeKey(raw.slice(33,65)),ext:true};
  const vapidKeys=await importVapidKeys({publicKey:publicJwk,privateKey:{...publicJwk,d:encodeKey(privateRaw)}});
  // Verify key pair belongs together (import alone does not prove that).
  const probe=new TextEncoder().encode('push-key-pair-check');
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},vapidKeys.privateKey,probe);
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapidKeys.publicKey,signature,probe)) throw new Error('Invalid VAPID configuration');
  return async (target:Subscription,payload:unknown):Promise<PushOutcome> => {
    // Validation before all network access. Diagnostics never contain subscriptions or keys.
    endpointURL(target.endpoint); decodeKey(target.p256dh,65); decodeKey(target.auth,16);
    const content=new TextEncoder().encode(JSON.stringify(payload));
    if(content.length>3000) throw new Error('Push payload too large');
    // New ephemeral encryption key per message, VAPID identity remains stable.
    const server=await ApplicationServer.new({contactInformation:config.contact,vapidKeys});
    const subscriber=server.subscribe({endpoint:target.endpoint,keys:{p256dh:target.p256dh,auth:target.auth}});
    const hkdfKey=await crypto.subtle.importKey('raw',await subscriber.getEcdhSecret(),'HKDF',false,['deriveBits']);
    const ikm=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:subscriber.authSecret(),info:new Uint8Array(await subscriber.getKeyInfo()).buffer},hkdfKey,256);
    const body=await encrypt(content.buffer,ikm,{header:{keyid:await server.getPublicKeyRaw()}});
    try {
      const response=await fetcher(target.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'300',Urgency:'normal',
          Authorization:`vapid t=${await subscriber.forgeVapidToken()}, k=${config.publicKey}`},body});
      const status=response.status; await response.body?.cancel();
      if(status>=200 && status<300) return 'accepted';
      if(status===404 || status===410) return 'gone';
      if(status===408 || status===429 || status>=500) return 'retry';
      return 'rejected'; // includes all 3xx, no redirect followed
    } catch { return 'retry'; } // unknown acceptance: explicit retry can duplicate, NOT exactly once
  };
}
