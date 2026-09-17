'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react';
import { createClient } from '@supabase/supabase-js';
import '@livekit/components-styles';

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const C={bg:'#0a030d',side:'#140a1e',text:'#fff',muted:'#a89db5',pink:'#e80068',purple:'#9b00e8',green:'#23a559'};

export default function ServidorPage(){
 const router=useRouter(); const [user,setUser]=useState(null); const [cred,setCred]=useState(null); const [channels,setChannels]=useState([]); const [active,setActive]=useState(null); const [token,setToken]=useState(''); const [loading,setLoading]=useState(true); const [connecting,setConnecting]=useState(false); const [error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:{session}}=await supabase.auth.getSession(); if(session){const {data:p}=await supabase.from('profiles').select('username,role,status').eq('id',session.user.id).single(); if(!p||p.status==='suspenso'){await supabase.auth.signOut();return router.replace('/');} setUser({username:p.username||session.user.email?.split('@')[0]||'Membro',role:p.role});setCred({type:'session',value:session.access_token});}
 else {const ticket=sessionStorage.getItem('convidadoTicket');if(!ticket)return router.replace('/');setUser({username:sessionStorage.getItem('convidadoUsername')||'Convidado',role:'convidado'});setCred({type:'guest',value:ticket});} setLoading(false);})();},[router]);
 useEffect(()=>{if(!cred)return;(async()=>{const headers=cred.type==='session'?{Authorization:`Bearer ${cred.value}`}:{'x-guest-ticket':cred.value};const r=await fetch('/api/channels',{headers});const j=await r.json();if(!r.ok){setError(j.error||'Não foi possível carregar os canais.');return;}setChannels(j.channels||[]);})();},[cred]);
 async function connect(channel){if(active===channel.name)return;setConnecting(true);setError('');setActive(channel.name);setToken('');try{const headers=cred.type==='session'?{Authorization:`Bearer ${cred.value}`}:{'x-guest-ticket':cred.value};const r=await fetch(`/api/token?room=${encodeURIComponent(channel.name)}`,{headers});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível entrar.');setToken(j.token);}catch(e){setActive(null);setError(e.message);}finally{setConnecting(false);}}
 function disconnect(){setActive(null);setToken('');}
 if(loading)return <main style={{height:'100vh',display:'grid',placeItems:'center',background:C.bg,color:C.pink,fontFamily:'sans-serif'}}>CARREGANDO COMPLEXO...</main>;
 return <main style={{height:'100vh',display:'flex',background:C.bg,color:C.text,fontFamily:'sans-serif',overflow:'hidden'}}>
  <aside style={{width:280,background:C.side,borderRight:'1px solid #29152f',display:'flex',flexDirection:'column'}}>
   <div style={{padding:20,borderBottom:'1px solid #29152f',fontWeight:900,fontSize:20,color:C.pink}}>COMPLEXO</div>
   <div style={{padding:15,flex:1,overflowY:'auto'}}><div style={{color:C.pink,fontSize:12,fontWeight:'bold',marginBottom:10}}>CANAIS DE VOZ</div>{channels.map(ch=><button key={ch.id} onClick={()=>connect(ch)} style={{width:'100%',textAlign:'left',padding:'10px 12px',marginBottom:4,border:0,borderRadius:6,cursor:'pointer',color:active===ch.name?C.text:C.muted,background:active===ch.name?'rgba(155,0,232,.25)':'transparent'}}><span style={{color:C.purple,fontSize:18}}>#</span> {ch.name}</button>)}</div>
   <div style={{padding:15,borderTop:'1px solid #29152f'}}><b>{user.username}</b><div style={{fontSize:11,color:C.green}}>{user.role}</div>{user.role==='admin'&&<button onClick={()=>router.push('/admin')} style={{marginTop:10,width:'100%',padding:8}}>Painel Admin</button>}{active&&<button onClick={disconnect} style={{marginTop:8,width:'100%',padding:8}}>Desconectar</button>}</div>
  </aside>
  <section style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><header style={{height:64,borderBottom:'1px solid #29152f',display:'flex',alignItems:'center',padding:'0 20px'}}><b>{active?`# ${active}`:'Selecione um canal'}</b></header><div style={{flex:1,minHeight:0,position:'relative'}}>{error&&<div style={{margin:20,padding:12,border:'1px solid #da373c',borderRadius:6}}>{error}</div>}{connecting&&<div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',background:'rgba(10,3,13,.8)',zIndex:2}}>ESTABELECENDO CONEXÃO...</div>}{active&&token?<LiveKitRoom token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL} connect={true} video={false} audio={true} style={{height:'100%'}}><RoomAudioRenderer/><VideoConference/></LiveKitRoom>:!error&&<div style={{height:'100%',display:'grid',placeItems:'center',color:C.muted}}>Selecione um canal de voz para entrar na call.</div>}</div></section>
 </main>;
}
