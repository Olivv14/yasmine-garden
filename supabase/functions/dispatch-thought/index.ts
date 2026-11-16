import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createHandler,requiredEnvironment,type Rpc } from '../_shared/push-handler.ts';
import { createPushSender } from '../_shared/push-transport.ts';
// No service client exists at module load. No logging of request/provider errors.
Deno.serve(async request=>{
 try {
  const env=requiredEnvironment(name=>Deno.env.get(name));
  const handler=createHandler({appUrl:env.PUBLIC_APP_URL,
    authenticate:async token=>{
      const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})}});
      // Never getSession()/decode-only auth. Explicit remote Auth validation.
      const {data,error}=await client.auth.getUser(token);if(error || !data.user) throw new Error('Authentication required');
      return {user:data.user,rpc:async(name,args)=>{const {data,error,status}=await client.rpc(name,args);return {data,error,status};}};
    },
    privileged:async()=>{
      const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})}});
      const send=await createPushSender({publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,contact:env.VAPID_CONTACT});
      return {rpc:(async(name,args)=>await client.rpc(name,args)) as Rpc,send};
    }});
  return await handler(request);
 } catch (error) {
  const message=error instanceof Error?error.message:'';
  const missing=message.match(/^Missing required environment: ([A-Z_]+)$/)?.[1];
  return new Response(JSON.stringify(missing?{error:'push_environment_missing',required_key:missing}:{error:'push_runtime_configuration_required'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
});
