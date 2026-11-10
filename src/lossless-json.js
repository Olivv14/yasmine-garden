// Preserve integer JSON tokens BEFORE the SDK's native JSON.parse can round them.
// Strings (including escaped quotes), fractions and exponent tokens stay untouched.
export function losslessJSONText(text){
 let out='',i=0;
 while(i<text.length){const start=i,c=text[i];
  if(c==='"'){i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}out+=text.slice(start,i);continue;}
  if(c==='-'||(c>='0'&&c<='9')){const match=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(match){const token=match[0];i+=token.length;out+=!/[.eE]/.test(token)&&(BigInt(token)>BigInt(Number.MAX_SAFE_INTEGER)||BigInt(token)<BigInt(Number.MIN_SAFE_INTEGER))?JSON.stringify(token):token;continue;}}
  out+=c;i++;
 }
 return out;
}
export function losslessFetch(projectURL,fetcher=(...args)=>globalThis.fetch(...args)){
 const origin=new URL(projectURL).origin;
 return async(input,init)=>{const response=await fetcher(input,init),url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.origin!==origin||!url.pathname.startsWith('/rest/v1/')||!response.headers.get('content-type')?.includes('json')||[204,205,304].includes(response.status))return response;
  let text=losslessJSONText(await response.text());
  // PT409 is the server's non-retrying business conflict; keep the legacy client code.
  // Only parse failures are ignored: malformed JSON still reaches the SDK unchanged.
  if(response.status===409&&/^application\/(?:[\w!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')){let error;try{error=JSON.parse(text)}catch{}
   if(error&&typeof error==='object'&&!Array.isArray(error)&&error.code==='PT409'){
    // Splice only the last root code value; reserialization would change other numeric tokens.
    let depth=0,code;
    for(const match of text.matchAll(/("(?:\\.|[^"\\])*")(\s*:\s*)("(?:\\.|[^"\\])*")|"(?:\\.|[^"\\])*"|[{}\[\]]/g)){
     if(match[0]==='{'||match[0]==='[')depth++;else if(match[0]==='}'||match[0]===']')depth--;
     else if(depth===1&&match[1]&&JSON.parse(match[1])==='code'&&JSON.parse(match[3])==='PT409')code={start:match.index+match[1].length+match[2].length,end:match.index+match[0].length};
    }
    if(code)text=text.slice(0,code.start)+'"40001"'+text.slice(code.end);
   }
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
  return new Response(text,{status:response.status,statusText:response.statusText,headers});
 };
}
// Defense in depth for callers/doubles that have ALREADY lost precision.
export function casVersion(value){
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)throw Object.assign(Error('Unsafe CAS version'),{code:'UNSAFE_CAS_VERSION',uiKey:'errors.serverShape'});return value;}
 if(typeof value!=='string'||!/^\d+$/.test(value)||BigInt(value)>9223372036854775807n)throw Object.assign(Error('Invalid CAS version'),{code:'UNSAFE_CAS_VERSION',uiKey:'errors.serverShape'});
 return value;
}
