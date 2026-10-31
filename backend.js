'use strict';
(()=>{
 const C=window.KPICore,D=window.KPIDashboard,$=id=>document.getElementById(id);
 let client=null,user=null,mode='sample',busy=false,generation=0,requestVersion=0;
 let rows=C.SAMPLE.map((r,i)=>({...r,id:'sample-'+i}));
 const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error);};
 function draw(){
  D.setRows(rows);$('auth-panel').hidden=mode==='sample';$('login').hidden=!!user;$('logout').hidden=!user;
  $('auth-fields').disabled=busy;$('record-fields').disabled=busy||!user||mode!=='db';
  $('refresh').disabled=busy||!user;for(const id of ['logout','db-mode','sample-mode'])$(id).disabled=busy;
  $('account').textContent=user?'로그인: '+(user.email||'앱 사용자'):'로그아웃 상태';
  $('mode-label').textContent=mode==='sample'?'샘플 모드 · DB 미연결':user?'DB 모드 · 본인 자료':'DB 모드 · 로그인 전';
  $('mode-detail').textContent=mode==='sample'?'가상 6건입니다. DB에 저장하지 않았습니다.':'샘플은 자동 저장하지 않습니다. DB에서 받은 본인 자료만 표시합니다.';
 }
 function sessionChanged(session){
  generation++;requestVersion++;user=session?.user||null;rows=[];$('record').reset();$('password').value='';message('');draw();
 }
 async function run(action){if(busy)return;busy=true;draw();try{await action();}catch(e){message(e.message||'요청에 실패했습니다.',true);}finally{busy=false;draw();}}
 async function load(){
  if(!user||mode!=='db')return;
  const token=generation,request=++requestVersion,uid=user.id,dataRows=[];let from=0;
  message('본인 DB 조회 중…');
  for(;;){
   const {data,error}=await client.from('kpi_records').select('id,month,team,target,actual').eq('user_id',uid).order('id').range(from,from+499);
   if(token!==generation||request!==requestVersion)return;
   if(error){rows=[];draw();throw Error('조회 실패. 설정·로그인·테이블·RLS를 확인하세요.');}
   if(!data?.length)break;
   for(const r of data)dataRows.push({...r,...C.validateRecord(r)});
   from+=data.length;if(from>100000){rows=[];draw();throw Error('교육용 조회 범위 초과. 일부 자료의 합계를 전체 합계로 표시하지 않습니다.');}
  }
  rows=dataRows;draw();message('DB에서 '+rows.length+'건 조회했습니다.');
 }
 function sdk(){
  if(window.supabase)return Promise.resolve(window.supabase);
  return new Promise((resolve,reject)=>{
   const s=document.createElement('script'),timer=setTimeout(()=>{s.remove();reject(Error('라이브러리 로드 시간 초과'));},15000);
   s.src='vendor/supabase.js';s.onload=()=>{clearTimeout(timer);window.supabase?resolve(window.supabase):reject(Error('라이브러리 초기화 실패'));};s.onerror=()=>{clearTimeout(timer);reject(Error('vendor/supabase.js를 읽지 못했습니다.'));};document.head.append(s);
  });
 }
 $('db-mode').onclick=()=>run(async()=>{
  const cfg=window.KPI_CONFIG;
  if(!/^https:\/\/[^/]+\/?$/.test(cfg?.supabaseUrl||'')||!cfg?.supabasePublishableKey?.startsWith('sb_publishable_'))throw Error('미연결: config.js에 Project URL과 공개용 publishable key를 입력하세요.');
  if(!client){const S=await sdk();client=S.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
   client.auth.onAuthStateChange((event,session)=>{
    if(mode!=='db'||event==='INITIAL_SESSION')return;
    if((session?.user?.id||null)!==(user?.id||null)||event==='SIGNED_OUT'){
     sessionChanged(session);if(session)setTimeout(()=>run(load),0);
    }
   });
  }
  const {data,error}=await client.auth.getSession();if(error)throw Error('로그인 상태 확인 실패');
  mode='db';sessionChanged(data.session);if(user)await load();else message('준비한 앱 사용자로 로그인하세요.');
 });
 $('sample-mode').onclick=()=>{if(busy)return;mode='sample';sessionChanged(null);rows=C.SAMPLE.map((r,i)=>({...r,id:'sample-'+i}));draw();};
 $('login').onsubmit=e=>{e.preventDefault();run(async()=>{
  if(!client||mode!=='db')throw Error('Supabase 연결을 먼저 선택하세요.');
  let result;try{result=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});}finally{$('password').value='';}
  if(result.error)throw Error('로그인 실패. 앱 사용자 계정과 이메일 확인 상태를 확인하세요.');
  sessionChanged(result.data.session);await load();
 });};
 $('logout').onclick=()=>run(async()=>{const {error}=await client.auth.signOut();if(error)throw Error('로그아웃 실패. 다시 시도하세요.');sessionChanged(null);message('로그아웃했습니다.');});
 $('refresh').onclick=()=>run(load);
 $('record').onsubmit=e=>{e.preventDefault();run(async()=>{
  if(!user||mode!=='db')throw Error('DB 모드에서 로그인하세요.');
  const token=generation,record=C.validateRecord(Object.fromEntries(['month','team','target','actual'].map(k=>[k,$(k).value])));
  const {data,error}=await client.from('kpi_records').insert({...record,user_id:user.id}).select('id');
  if(token!==generation)return;
  if(error||data?.length!==1)throw Error(error?.code==='23505'?'같은 월·부서 중복입니다. 기존 값을 보존했습니다.':'저장 실패 또는 변경 0건. 설정·로그인·RLS를 확인하세요.');
  try{await load();if(token===generation)message('DB 저장 성공 · 재조회 완료');}catch{if(token===generation)message('DB 저장은 성공했지만 재조회에 실패했습니다. 다시 조회하세요.',true);}
 });};
 draw();
})();
