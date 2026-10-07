/* eslint-disable @typescript-eslint/no-explicit-any -- Production plain-JS adapter is exercised in a minimal window harness. */
import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { browserDeliveryProofSchema } from '../lib/browser-delivery-proof';

function post(id='900', options: {parent?:string;quote?:string;media?:string[]}={}) {
  return { rest_id:id,core:{user_results:{result:{legacy:{screen_name:'proofqa'}}}},legacy:{id_str:id,full_text:'Approved expression',created_at:new Date().toUTCString(),in_reply_to_status_id_str:options.parent,quoted_status_id_str:options.quote,
    extended_entities:{media:(options.media??[]).map(id=>({id_str:id,media_url_https:'https://pbs.twimg.com/image'}))}} };
}
function harness(storage=new Map<string,string>()) {
  let listener: (event:unknown)=>void;
  let body: unknown = {};
  const win: any = { crypto:webcrypto,location:{href:'https://x.com/home',origin:'https://x.com'},sessionStorage:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},
    addEventListener:(_type:string,fn:typeof listener)=>{listener=fn;},postMessage:vi.fn(),fetch:vi.fn(async()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})) };
  const mod: any = {exports:{}};
  new Function('window','module',readFileSync('extension/x-response-observer.js','utf8'))(win,mod);
  const send = (action:string,config?:unknown)=>listener!({source:win,origin:win.location.origin,data:{type:'OPENPRESENCE_X_EVIDENCE_REQUEST',token:'test-token',action,config}});
  const start = (assets:unknown[]=[])=>send('start',{executionId:'execution',permitNonce:'permit',expiresAt:Date.now()+180000,assets});
  const fetch = async (url:string,response:unknown,init?:RequestInit)=>{body=response;await win.fetch(url,init);await new Promise(resolve=>setTimeout(resolve,20));};
  return {win,api:mod.exports,send,start,fetch,storage};
}
const uploadUrl='https://upload.x.com/1.1/media/upload.json';
const createUrl='https://x.com/i/api/graphql/query/CreateTweet';
const readUrl='https://x.com/i/api/graphql/query/TweetDetail';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
async function waitFor(h:ReturnType<typeof harness>,predicate:(value:any)=>boolean) {
  for(let i=0;i<100;i++){const value=h.api.snapshot();if(predicate(value))return value;await new Promise(r=>setTimeout(r,5));}throw new Error('Observer did not settle');
}

describe('claimed Chrome website evidence collector',()=>{
  it('uses the provider display range for attachment suffixes and preserves authored URLs exactly',()=>{
    const h=harness(); const raw=post('900',{media:['123']});
    raw.legacy.full_text='Approved expression https://t.co/attachment';
    Object.assign(raw.legacy,{display_text_range:[0,'Approved expression'.length]});
    expect(h.api.publicPost(raw,'900').text).toBe('Approved expression');
    raw.legacy.full_text='See https://t.co/authored https://t.co/attachment';
    Object.assign(raw.legacy,{display_text_range:[0,'See https://t.co/authored'.length]});
    expect(h.api.publicPost(raw,'900').text).toBe('See https://t.co/authored');
  });
  it('composes exact approved bytes → segmented website upload → created ID → independent public reply readback → server proof schema',async()=>{
    const h=harness();h.start([{assetId:'asset',sha256:digest('approved-file')}]);
    for(const [index,content] of ['approved-','file'].entries()){
      const form=new FormData();form.set('command','APPEND');form.set('media_id','123');form.set('segment_index',String(index));form.set('media',new Blob([content]));
      await h.fetch(uploadUrl,{}, {method:'POST',body:form,headers:{authorization:'SECRET-NEVER-RETAIN'}});
    }
    await h.fetch(uploadUrl,{media_id_string:'123'},{method:'POST',body:new URLSearchParams({command:'FINALIZE',media_id:'123'})});
    await waitFor(h,x=>x?.uploads.length===1);
    await h.fetch(createUrl,{data:{create_tweet:{tweet_results:{result:post('900',{parent:'55',media:['123']})}}}});
    expect(h.api.snapshot().post).toBeUndefined();
    await h.fetch(readUrl,{data:{thread:{entries:[{content:{result:post('900',{parent:'55',media:['123']})}}]}}});
    const evidence=await waitFor(h,x=>x?.readback);
    const proof={...evidence,version:1,source:'x_website_response',executorId:'executor',bridgeId:'bridge',presenceId:'presence'};
    expect(browserDeliveryProofSchema.safeParse(proof).success).toBe(true);
    expect(proof.post.parentId).toBe('55');expect(proof.post.mediaIds).toEqual(['123']);expect(proof.uploads[0]).toMatchObject({assetId:'asset',sha256:digest('approved-file'),platformMediaId:'123',executionId:'execution',permitNonce:'permit'});
    expect(JSON.stringify(evidence)).not.toContain('SECRET');
    expect(JSON.stringify([...h.storage.values()])).not.toContain('SECRET');
  });
  it('cannot treat CreateTweet as readback and cannot bind different upload bytes or another public object',async()=>{
    const h=harness();h.start([{assetId:'asset',sha256:digest('approved')}]);
    const form=new FormData();form.set('media',new Blob(['different']));
    await h.fetch(uploadUrl,{media_id_string:'123'},{method:'POST',body:form});
    await h.fetch(createUrl,{data:{create_tweet:{tweet_results:{result:post()}}}});
    await h.fetch(readUrl,{data:{result:post('901')}});
    expect(h.api.snapshot()).toMatchObject({createdPostId:'900',readback:false,uploads:[]});
    expect(h.api.snapshot().post).toBeUndefined();
  });
  it('restores only bounded sanitized claim lineage across fresh document navigation and derives quote target from observed world',async()=>{
    const h=harness();h.start();await h.fetch(createUrl,{data:{create_tweet:{tweet_results:{result:post('900',{quote:'77'})}}}});
    const next=harness(h.storage);await next.fetch(readUrl,{data:{result:post('900',{quote:'77'})}});
    expect(next.api.snapshot()).toMatchObject({createdPostId:'900',readback:true,post:{quotedTargetId:'77'}});
    next.send('stop');expect(next.api.snapshot()).toBeNull();expect(h.storage.size).toBe(0);
  });
  it('is inert without a claim, excludes DMs/unrelated origins, and refuses missing stable media identity',async()=>{
    const h=harness();await h.fetch(createUrl,{data:{create_tweet:{tweet_results:{result:post()}}}});expect(h.api.snapshot()).toBeNull();
    h.start();expect(h.api.route('https://x.com/i/api/1.1/dm/inbox_initial_state.json')).toBeNull();expect(h.api.route('https://evil.invalid/i/api/graphql/query/CreateTweet')).toBeNull();
    const raw=post();raw.legacy.extended_entities.media=[{media_url_https:'https://pbs.twimg.com/image'}] as any;
    expect(h.api.publicPost(raw,'900')).toBeNull();
    expect(h.api.publicPost({...post(),legacy:{...post().legacy,created_at:'invalid'}},'900')).toBeNull();
  });
  it('rejects gapped segment lineage and restores no expired claim',async()=>{
    const h=harness();h.start([{assetId:'asset',sha256:digest('approved')}]);const f=new FormData();f.set('command','APPEND');f.set('media_id','123');f.set('segment_index','1');f.set('media',new Blob(['approved']));await h.fetch(uploadUrl,{}, {body:f});await h.fetch(uploadUrl,{media_id_string:'123'},{body:new URLSearchParams({command:'FINALIZE',media_id:'123'})});expect(h.api.snapshot().uploads).toEqual([]);
    const storage=new Map([['openpresence-x-response-claim-v1',JSON.stringify({executionId:'old',expiresAt:Date.now()-1})]]);expect(harness(storage).api.snapshot()).toBeNull();
  });
});
