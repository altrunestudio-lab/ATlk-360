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
varying vec2 point; uniform sampler2D atlas; uniform mat4 inverseProjection; uniform mat4 orientation; uniform vec2 angles; uniform float immersive;
void main(){
 vec3 d;
 if(immersive>0.5){vec4 p=inverseProjection*vec4(point,1.,1.);d=mat3(orientation)*normalize(p.xyz/p.w);}
 else {d=normalize(vec3(point.x*angles.y,point.y*0.65,-1.));}
 float cy=cos(angles.x),sy=sin(angles.x);d=vec3(cy*d.x-sy*d.z,d.y,sy*d.x+cy*d.z);
 // 3DVista strip order: right, left, top, bottom, front, back.
 // Source cubemaps face +Z at the front; WebXR cameras look toward -Z.
 d=vec3(d.x,d.y,-d.z);
 vec3 a=abs(d);vec2 uv;float face;
 if(a.x>=a.y&&a.x>=a.z){if(d.x>0.){face=0.;uv=vec2(-d.z,-d.y)/a.x;}else{face=1.;uv=vec2(d.z,-d.y)/a.x;}}
 else if(a.y>=a.z){if(d.y>0.){face=2.;uv=vec2(d.x,d.z)/a.y;}else{face=3.;uv=vec2(d.x,-d.z)/a.y;}}
 else{if(d.z>0.){face=4.;uv=vec2(d.x,-d.y)/a.z;}else{face=5.;uv=vec2(-d.x,-d.y)/a.z;}}
 uv=clamp(uv*0.5+0.5,vec2(0.000977),vec2(0.999023));
 gl_FragColor=texture2D(atlas,vec2((face+uv.x)/6.,uv.y));
}`));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
const uniforms=Object.fromEntries(['atlas','inverseProjection','orientation','angles','immersive'].map(n=>[n,gl.getUniformLocation(program,n)]));
const textures=[];
function image(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Cannot load '+url));im.src=url;});}
async function load(){
 const images=await Promise.all(Array.from({length:12},(_,i)=>image(`media/panorama_463381A8_4879_6517_41C7_1EAFB6947AC8_0/0/0_${i}.jpg`)));
 for(let eye=0;eye<2;eye++){const strip=document.createElement('canvas');strip.width=3072;strip.height=512;const ctx=strip.getContext('2d');for(let f=0;f<6;f++)ctx.drawImage(images[eye*6+f],f*512,0,512,512);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,strip);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);textures.push(t);}
 ready=true;status.textContent='Panorama ready. Drag to look around.';await checkXR();
}
// General 4x4 inverse, used for each headset eye projection.
function inverse(m){const a=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?m[c*4+r]:+(c-4===r)));for(let c=0;c<4;c++){let k=c;for(let r=c+1;r<4;r++)if(Math.abs(a[r][c])>Math.abs(a[k][c]))k=r;[a[c],a[k]]=[a[k],a[c]];const v=a[c][c];if(Math.abs(v)<1e-10)throw new Error('Invalid projection');a[c]=a[c].map(x=>x/v);for(let r=0;r<4;r++)if(r!==c){const t=a[r][c];a[r]=a[r].map((x,j)=>x-t*a[c][j]);}}return new Float32Array(Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]));}
function draw(eye,projection=identity,rotation=identity,xr=false){gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[(eye+(swap?1:0))%2]);gl.uniform1i(uniforms.atlas,0);gl.uniformMatrix4fv(uniforms.inverseProjection,false,projection);gl.uniformMatrix4fv(uniforms.orientation,false,rotation);gl.uniform2f(uniforms.angles,yaw,canvas.width/canvas.height*.65);gl.uniform1f(uniforms.immersive,xr?1:0);gl.drawArrays(gl.TRIANGLES,0,6);frameCount++;}
function desktop(){if(!session&&ready){const scale=Math.min(devicePixelRatio,2),w=Math.round(innerWidth*scale),h=Math.round(innerHeight*scale);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
 // Desktop pitch uses an inverse projection with the same rendering path as XR.
 const f=1/Math.tan(Math.PI/6),aspect=w/h,n=.1,z=100;const p=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0]);const c=Math.cos(pitch),s=Math.sin(pitch);const rot=new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);draw(0,inverse(p),rot,true);}requestAnimationFrame(desktop);}
function xrFrame(time,frame){const active=frame.session;if(active!==session)return;active.requestAnimationFrame(xrFrame);const pose=frame.getViewerPose(space);if(!pose)return;gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clear(gl.COLOR_BUFFER_BIT);for(const view of pose.views){const v=layer.getViewport(view);gl.viewport(v.x,v.y,v.width,v.height);draw(view.eye==='right'?1:0,inverse(view.projectionMatrix),view.transform.matrix,true);}}
async function checkXR(){enter.disabled=true;if(!isSecureContext){enter.textContent='HTTPS required for VR';status.textContent='Use HTTPS on Quest. Desktop localhost is also allowed.';return;}if(!navigator.xr){enter.textContent='Open in Quest Browser';return;}try{const supported=await navigator.xr.isSessionSupported('immersive-vr');enter.textContent=supported?'Enter VR':'VR headset unavailable';enter.disabled=!supported||!ready;}catch(e){enter.textContent='VR check failed';fail(e);}}
enter.addEventListener('click',async()=>{enter.disabled=true;try{
 // Request from the click handler, before awaiting other work, to retain user activation.
 const next=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});session=next;
 next.addEventListener('end',()=>{session=null;space=null;layer=null;document.body.classList.remove('immersive');status.textContent='VR ended.';checkXR();});
 await gl.makeXRCompatible();layer=new XRWebGLLayer(next,gl,{alpha:false,antialias:false});next.updateRenderState({baseLayer:layer});space=await next.requestReferenceSpace('local');document.body.classList.add('immersive');next.addEventListener('select',e=>{const pose=e.frame.getViewerPose(space);if(pose){const m=pose.views[0].transform.matrix;yaw=-Math.atan2(-m[8],m[10]);}});next.requestAnimationFrame(xrFrame);
 }catch(e){if(session)await session.end().catch(()=>{});fail(e);checkXR();}});
document.querySelector('#recenter').onclick=()=>{yaw=0;pitch=0;};document.querySelector('#swap').onchange=e=>{swap=e.target.checked;};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.004;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.004));drag=[e.clientX,e.clientY];};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;enter.disabled=true;status.textContent='Graphics context lost. Reload to continue.';if(session)session.end();});
window.addEventListener('focus',()=>{if(ready&&!session)checkXR();});
window.xrDiagnostics=()=>({ready,frameCount,immersive:!!session,stereoTextures:textures.length,sourceFaceSize:512,swapEyes:swap});
load().catch(fail);requestAnimationFrame(desktop);

