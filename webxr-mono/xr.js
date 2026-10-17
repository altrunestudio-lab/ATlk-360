// Independent WebXR viewer. Original 3DVista files are read-only inputs.
const canvas=document.querySelector('#view'), status=document.querySelector('#status'), enter=document.querySelector('#enter');
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,xrCompatible:true});
let session=null,space=null,layer=null,ready=false,yaw=0,pitch=0,swap=false,drag=null,frameCount=0;
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function fail(error){status.textContent=error.message||String(error);console.error(error);}
if(!gl){fail(new Error('WebGL is unavailable. Please enable browser graphics acceleration.'));throw new Error('WebGL unavailable');}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();
gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position; varying vec2 point; void main(){point=position;gl_Position=vec4(position,0.,1.);}'));
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;
varying vec2 point; uniform sampler2D atlas; uniform mat4 inverseProjection; uniform mat4 orientation; uniform vec2 angles; uniform float immersive; uniform float spherical;uniform float faceTexel;
uniform sampler2D menuTexture;uniform float fade;uniform float menuVisible;
uniform vec3 eyeOrigin;uniform vec3 panelCenter;uniform vec3 panelRight;uniform vec3 panelUp;uniform vec3 panelNormal;
vec4 present(vec4 color,vec3 ray){
 color.rgb*=fade;
 if(menuVisible>0.5){float denom=dot(ray,panelNormal);if(abs(denom)>0.0001){float t=dot(panelCenter-eyeOrigin,panelNormal)/denom;if(t>0.){vec3 delta=eyeOrigin+ray*t-panelCenter;vec2 uv=vec2(dot(delta,panelRight)/1.1+0.5,0.5-dot(delta,panelUp)/0.825);if(uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.){vec4 ui=texture2D(menuTexture,uv);color.rgb=mix(color.rgb,ui.rgb,ui.a);}}}}
 return color;
}
void main(){
 vec3 d;
 if(immersive>0.5){vec4 p=inverseProjection*vec4(point,1.,1.);d=mat3(orientation)*normalize(p.xyz/p.w);}
 else {d=normalize(vec3(point.x*angles.y,point.y*0.65,-1.));}
 vec3 worldRay=normalize(d);
 float cy=cos(angles.x),sy=sin(angles.x);d=vec3(cy*d.x-sy*d.z,d.y,sy*d.x+cy*d.z);
 // 3DVista strip order: right, left, top, bottom, front, back.
 // Source cubemaps face +Z at the front; WebXR cameras look toward -Z.
 d=vec3(d.x,d.y,-d.z);
 if(spherical>0.5){vec2 sphereUV=vec2(atan(d.x,d.z)/6.28318530718+0.5,acos(clamp(d.y,-1.,1.))/3.14159265359);gl_FragColor=present(texture2D(atlas,sphereUV),worldRay);return;}
 vec3 a=abs(d);vec2 uv;float face;
 if(a.x>=a.y&&a.x>=a.z){if(d.x>0.){face=0.;uv=vec2(-d.z,-d.y)/a.x;}else{face=1.;uv=vec2(d.z,-d.y)/a.x;}}
 else if(a.y>=a.z){if(d.y>0.){face=2.;uv=vec2(d.x,d.z)/a.y;}else{face=3.;uv=vec2(d.x,-d.z)/a.y;}}
 else{if(d.z>0.){face=4.;uv=vec2(d.x,-d.y)/a.z;}else{face=5.;uv=vec2(-d.x,-d.y)/a.z;}}
 uv=clamp(uv*0.5+0.5,vec2(faceTexel),vec2(1.-faceTexel));
 gl_FragColor=present(texture2D(atlas,vec2((face+uv.x)/6.,uv.y)),worldRay);
}`));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
const uniforms=Object.fromEntries(['atlas','inverseProjection','orientation','angles','immersive','spherical','faceTexel','menuTexture','fade','menuVisible','eyeOrigin','panelCenter','panelRight','panelUp','panelNormal'].map(n=>[n,gl.getUniformLocation(program,n)]));
let textures=[]; let sceneIndex=0,loadVersion=0;
const config=await fetch("tour.json").then(r=>{if(!r.ok)throw new Error("Missing tour configuration");return r.json();});
const selector=document.querySelector("#scenes");
config.scenes.forEach((scene,i)=>selector.add(new Option(scene.label,String(i))));
selector.onchange=()=>loadScene(Number(selector.value)).catch(fail);
function image(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Cannot load '+url));im.src=url;});}
async function loadScene(index){
 if(busy)return;index=(index+config.scenes.length)%config.scenes.length;
 if(ready&&index===sceneIndex)return;
 busy=true;targetIndex=index;selector.disabled=true;enter.disabled=true;
 const scene=config.scenes[index];status.textContent='Loading '+scene.label+'...';
 const next=[];
 try{
 if(ready){startFade(0,250);await pause(260);}
 loadingShown=true;loadingStarted=performance.now();redrawMenu();document.querySelector('#transition').hidden=false;document.querySelector('#transition strong').textContent='Loading '+scene.label+'...';
 const faceSize=Math.min(scene.faceSize,Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/6),2048);
 const strip=document.createElement('canvas');strip.width=faceSize*6;strip.height=faceSize;const ctx=strip.getContext('2d');
 // Fetch up to six tiles together, then assemble all faces before revealing them.
 const jobs=[];for(let f=0;f<6;f++){const face=scene.faces[f];for(let row=0;row<face.rows;row++)for(let col=0;col<face.columns;col++)jobs.push({f,face,row,col});}
 let jobIndex=0;await Promise.all(Array.from({length:Math.min(6,jobs.length)},async()=>{while(jobIndex<jobs.length){const {f,face,row,col}=jobs[jobIndex++];const im=await image(face.url.replace('{row}',row).replace('{column}',col));ctx.drawImage(im,(f+col/face.columns)*faceSize,row/face.rows*faceSize,faceSize/face.columns,faceSize/face.rows);}}));
 const t=gl.createTexture();next.push(t);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,strip);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 await pause(Math.max(0,450-(performance.now()-loadingStarted)));
 new Set(textures).forEach(t=>gl.deleteTexture(t));textures=[t,t];sceneIndex=index;ready=true;selector.value=String(index);document.querySelector('header span').textContent=scene.label+' / Mono';
 loadingShown=false;document.querySelector('#transition').hidden=true;redrawMenu();startFade(1,350);await pause(360);
 status.textContent='Ready. In VR, point a controller at the menu and pull the trigger. Grip brings the menu in front of you.';
 }catch(e){next.forEach(t=>gl.deleteTexture(t));loadingShown=false;document.querySelector('#transition').hidden=true;startFade(1,250);selector.value=String(sceneIndex);fail(e);menuError='Could not load panorama. Please try again.';}
 finally{busy=false;selector.disabled=false;updateDesktopButtons();redrawMenu();if(!session)await checkXR();}
}
let busy=false,targetIndex=0,loadingShown=false,loadingStarted=0;
let fadeFrom=0,fadeTo=0,fadeStart=0,fadeDuration=1;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function currentFade(){const t=Math.min(1,(performance.now()-fadeStart)/fadeDuration);return fadeFrom+(fadeTo-fadeFrom)*(t*t*(3-2*t));}
function startFade(to,ms){fadeFrom=currentFade();fadeTo=to;fadeStart=performance.now();fadeDuration=ms;}
let menuOpen=true,menuPage=0,panelPlaced=false,lastHead=identity,menuError='',buttons=[],hoverId='',pointer=null;
const panel={center:[0,-.25,-1.6],right:[1,0,0],normal:[0,0,1]};
const menuCanvas=document.createElement('canvas');menuCanvas.width=1024;menuCanvas.height=768;const menuCtx=menuCanvas.getContext('2d');
const menuTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,menuTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.activeTexture(gl.TEXTURE0);
function clipped(text,max){let s=text;while(menuCtx.measureText(s).width>max&&s.length)s=s.slice(0,-1);return s===text?s:s+'...';}
function redrawMenu(){
 const c=menuCtx;c.clearRect(0,0,1024,768);c.fillStyle='rgba(13,21,24,.97)';c.fillRect(0,0,1024,768);buttons=[];
 c.fillStyle='#ffffff';c.font='bold 42px sans-serif';c.fillText(loadingShown?'Loading panorama...':'ATlk 360',40,66);
 c.font='26px sans-serif';c.fillStyle='#b7cac3';c.fillText(clipped(config.scenes[loadingShown?targetIndex:sceneIndex].label,930),40,112);
 if(loadingShown){c.font='32px sans-serif';c.fillStyle='#b5f4d8';c.fillText('Please wait',40,370);c.font='24px sans-serif';c.fillText('The next view will fade in when it is ready.',40,425);}
 else{
 function button(id,label,x,y,w,h){buttons.push({id,label,x,y,w,h});c.fillStyle=id===hoverId?'#b5f4d8':id==='scene:'+sceneIndex?'#365d50':'#263b35';c.fillRect(x,y,w,h);c.fillStyle=id===hoverId?'#10231b':'#ffffff';c.font='bold 27px sans-serif';c.fillText(clipped(label,w-32),x+16,y+h/2+10);}
 button('previous','Previous',40,140,292,64);button('next','Next',350,140,292,64);button('exit','Exit VR',660,140,324,64);
 c.font='25px sans-serif';c.fillStyle='#b7cac3';c.fillText('Panoramas',40,246);
 const start=menuPage*4;for(let row=0;row<4;row++){const i=start+row;if(i<config.scenes.length)button('scene:'+i,(i+1)+'. '+config.scenes[i].label,40,268+row*76,944,64);}
 button('pagePrevious','< List',40,590,210,60);button('pageNext','List >',268,590,210,60);button('hide','Hide menu',660,590,324,60);
 c.font='24px sans-serif';c.fillStyle='#cbd7d2';c.fillText('Page '+(menuPage+1)+' / '+Math.ceil(config.scenes.length/4),500,628);
 c.font='22px sans-serif';c.fillText(menuError||'Point + trigger to select. Grip brings the menu back.',40,702);
 if(pointer){c.beginPath();c.arc(pointer.x,pointer.y,11,0,Math.PI*2);c.fillStyle='#ffffff';c.fill();c.strokeStyle='#10231b';c.lineWidth=3;c.stroke();}
 }
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,menuTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,menuCanvas);gl.activeTexture(gl.TEXTURE0);
}
function placePanel(m,centered=false){let fx=-m[8],fz=-m[10];const len=Math.hypot(fx,fz)||1;fx/=len;fz/=len;panel.center=[m[12]+fx*1.6,m[13]-(centered?0:.23),m[14]+fz*1.6];panel.normal=[-fx,0,-fz];panel.right=[-fz,0,fx];panelPlaced=true;}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function rayHit(frame,input){if(!input?.targetRaySpace)return null;const pose=frame.getPose(input.targetRaySpace,space);if(!pose)return null;const m=pose.transform.matrix,origin=[m[12],m[13],m[14]],dir=[-m[8],-m[9],-m[10]],denom=dot(dir,panel.normal);if(Math.abs(denom)<1e-5)return null;const t=dot(panel.center.map((v,i)=>v-origin[i]),panel.normal)/denom;if(t<=0)return null;const d=origin.map((v,i)=>v+t*dir[i]-panel.center[i]);const x=(dot(d,panel.right)/1.1+.5)*1024,y=(.5-d[1]/.825)*768;if(x<0||x>1024||y<0||y>768)return null;return{x,y,button:buttons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)};}
function updatePointers(frame){if(!menuOpen||loadingShown)return;let hit=null;for(const input of session.inputSources||[]){const candidate=rayHit(frame,input);if(candidate){hit=candidate;if(hit.button)break;}}
 const id=hit?.button?.id||'';if(id!==hoverId||!!hit!==!!pointer||(hit&&pointer&&Math.hypot(hit.x-pointer.x,hit.y-pointer.y)>3)){hoverId=id;pointer=hit?{x:hit.x,y:hit.y}:null;redrawMenu();}}
function activate(id){if(busy)return;menuError='';if(id==='exit'){session?.end().catch(fail);return;}if(id==='hide'){menuOpen=false;return;}if(id==='previous')loadScene(sceneIndex-1).catch(fail);else if(id==='next')loadScene(sceneIndex+1).catch(fail);else if(id.startsWith('scene:'))loadScene(Number(id.slice(6))).catch(fail);else if(id==='pageNext')menuPage=(menuPage+1)%Math.ceil(config.scenes.length/4);else if(id==='pagePrevious')menuPage=(menuPage-1+Math.ceil(config.scenes.length/4))%Math.ceil(config.scenes.length/4);redrawMenu();}
function onSelect(e){if(busy)return;if(!menuOpen){menuOpen=true;panelPlaced=false;redrawMenu();return;}const hit=rayHit(e.frame,e.inputSource);if(hit?.button)activate(hit.button.id);}
function updateDesktopButtons(){document.querySelector('#previous').disabled=busy;document.querySelector('#next').disabled=busy;}
function initializeControls(){document.querySelector('#previous').onclick=()=>loadScene(sceneIndex-1).catch(fail);document.querySelector('#next').onclick=()=>loadScene(sceneIndex+1).catch(fail);redrawMenu();}
// General 4x4 inverse, used for each headset eye projection.
function inverse(m){const a=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?m[c*4+r]:+(c-4===r)));for(let c=0;c<4;c++){let k=c;for(let r=c+1;r<4;r++)if(Math.abs(a[r][c])>Math.abs(a[k][c]))k=r;[a[c],a[k]]=[a[k],a[c]];const v=a[c][c];if(Math.abs(v)<1e-10)throw new Error('Invalid projection');a[c]=a[c].map(x=>x/v);for(let r=0;r<4;r++)if(r!==c){const t=a[r][c];a[r]=a[r].map((x,j)=>x-t*a[c][j]);}}return new Float32Array(Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]));}
function draw(eye,projection=identity,rotation=identity,xr=false){gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[(eye+(swap?1:0))%2]);gl.uniform1i(uniforms.atlas,0);
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,menuTexture);gl.uniform1i(uniforms.menuTexture,1);gl.activeTexture(gl.TEXTURE0);
 gl.uniform1f(uniforms.fade,currentFade());gl.uniform1f(uniforms.menuVisible,xr&&!!session&&(menuOpen||loadingShown)?1:0);
 gl.uniform3fv(uniforms.eyeOrigin,[rotation[12],rotation[13],rotation[14]]);gl.uniform3fv(uniforms.panelCenter,panel.center);gl.uniform3fv(uniforms.panelRight,panel.right);gl.uniform3fv(uniforms.panelUp,[0,1,0]);gl.uniform3fv(uniforms.panelNormal,panel.normal);gl.uniform1f(uniforms.faceTexel,.5/Math.min(config.scenes[sceneIndex].faceSize,Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/6),2048));gl.uniform1f(uniforms.spherical,config.scenes[sceneIndex].spherical?1:0);gl.uniformMatrix4fv(uniforms.inverseProjection,false,projection);gl.uniformMatrix4fv(uniforms.orientation,false,rotation);gl.uniform2f(uniforms.angles,yaw,canvas.width/canvas.height*.65);gl.uniform1f(uniforms.immersive,xr?1:0);gl.drawArrays(gl.TRIANGLES,0,6);frameCount++;}
function desktop(){if(!session&&ready){const scale=Math.min(devicePixelRatio,2),w=Math.round(innerWidth*scale),h=Math.round(innerHeight*scale);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
 // Desktop pitch uses an inverse projection with the same rendering path as XR.
 const f=1/Math.tan(Math.PI/6),aspect=w/h,n=.1,z=100;const p=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0]);const c=Math.cos(pitch),s=Math.sin(pitch);const rot=new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);draw(0,inverse(p),rot,true);}requestAnimationFrame(desktop);}
function xrFrame(time,frame){const active=frame.session;if(active!==session)return;active.requestAnimationFrame(xrFrame);const pose=frame.getViewerPose(space);if(!pose)return;
 lastHead=pose.views[0].transform.matrix;if(!panelPlaced||loadingShown)placePanel(lastHead,loadingShown);
 updatePointers(frame);
 gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);for(const view of pose.views){const v=layer.getViewport(view);gl.viewport(v.x,v.y,v.width,v.height);if(textures.length)draw(view.eye==='right'?1:0,inverse(view.projectionMatrix),view.transform.matrix,true);}}
async function checkXR(){enter.disabled=true;if(!isSecureContext){enter.textContent='HTTPS required for VR';status.textContent='Use HTTPS on Quest. Desktop localhost is also allowed.';return;}if(!navigator.xr){enter.textContent='Open in Quest Browser';return;}try{const supported=await navigator.xr.isSessionSupported('immersive-vr');enter.textContent=supported?'Enter VR':'VR headset unavailable';enter.disabled=!supported||!ready;}catch(e){enter.textContent='VR check failed';fail(e);}}
enter.addEventListener('click',async()=>{enter.disabled=true;try{
 // Request from the click handler, before awaiting other work, to retain user activation.
 const next=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});session=next;
 next.addEventListener('end',()=>{session=null;space=null;layer=null;panelPlaced=false;document.body.classList.remove('immersive');status.textContent='VR ended.';checkXR();});
 await gl.makeXRCompatible();layer=new XRWebGLLayer(next,gl,{alpha:false,antialias:false});next.updateRenderState({baseLayer:layer});space=await next.requestReferenceSpace('local');document.body.classList.add('immersive');menuOpen=true;panelPlaced=false;redrawMenu();next.addEventListener('select',onSelect);next.addEventListener('squeeze',()=>{menuOpen=true;panelPlaced=false;redrawMenu();});next.requestAnimationFrame(xrFrame);
 }catch(e){if(session)await session.end().catch(()=>{});fail(e);checkXR();}});
document.querySelector('#recenter').onclick=()=>{yaw=0;pitch=0;};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.004;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.004));drag=[e.clientX,e.clientY];};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;enter.disabled=true;status.textContent='Graphics context lost. Reload to continue.';if(session)session.end();});
window.addEventListener('focus',()=>{if(ready&&!session)checkXR();});
window.xrDiagnostics=()=>({busy,loadingShown,fade:currentFade(),menuOpen,menuPage,menuButtons:buttons.map(b=>({id:b.id,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h})),panel,ready,frameCount,immersive:!!session,stereoTextures:textures.length,sourceFaceSize:config.scenes[sceneIndex].faceSize,sceneIndex,sceneCount:config.scenes.length,swapEyes:swap});
initializeControls();loadScene(0).catch(fail);requestAnimationFrame(desktop);

