import * as React from 'react';
import * as k from '../../iso/iso-kit';
import { spring, follow } from '../../iso/react/live';
import { P, LEFT, COIN_AT, COIN_START, beamPaths, beamRule, panOffset, returnSpring, cyl, type Geometry } from './geometry';
import { clamp, smooth, coinsPerSecond, responseToShock, shockPulse, type CarryMachineProps } from './model';

function writeSolid(node: Element, p: k.SolidPaths) {
  node.querySelector('.iso-fill')?.setAttribute('d',p.fill);
  node.querySelector('.iso-top')?.setAttribute('d',p.top);
  node.querySelector('.iso-edge')?.setAttribute('d',p.outline);
  node.querySelectorAll('.iso-shade').forEach(el=>el.setAttribute('d',p.shades[Number(el.getAttribute('data-shade'))] || ''));
}

export function useMachine(data: CarryMachineProps, g: Geometry) {
  const root = React.useRef<HTMLDivElement>(null);
  const [lifted,setLifted] = React.useState(false);
  const [paused,setPaused] = React.useState(false);
  const [announcement,setAnnouncement] = React.useState('');
  const input = React.useRef({ lifted:false, paused:false, held:false, drag:1, hover:false, focus:false, lastTouch:-10, shockAt:-10, pointerX:0 });
  const controller = React.useRef({ wake:()=>{}, time:0 });

  React.useEffect(()=>{
    const el=root.current;
    if(!el) return;
    const beam = [...el.querySelectorAll('[data-beam]')];
    const left=el.querySelector('[data-pan="short"]');
    const right=el.querySelector('[data-pan="hedge"]');
    const weight=el.querySelector('[data-weight="hedge"]');
    const rule=el.querySelector('[data-beam-rule]');
    const needle=el.querySelector('[data-needle]');
    const fly=el.querySelector('[data-coin="flying"]') as SVGGElement | null;
    const stack=el.querySelector('[data-coins="stack"]');
    const gate=el.querySelector('[data-gate]');
    const damperRod=el.querySelector('[data-damper-rod]');
    const damperLink=el.querySelector('[data-damper-link]');
    const springBack=el.querySelector('[data-spring="back"]');
    const springFront=el.querySelector('[data-spring="front"]');
    const state={ time:0, phase:0.08, angle:{at:0,rate:0}, dial:{at:0,rate:0}, lift:input.current.lifted?1:0, last:0, frame:0, visible:false, previousAngle:NaN };
    const still=window.matchMedia('(prefers-reduced-motion: reduce)');

    const draw=(angle:number,lift:number,phase:number)=>{
      const leftBy=panOffset(LEFT,angle), rightBy=panOffset(g.right,angle);
      if(angle!==state.previousAngle) {
        beamPaths(g.right,angle).forEach((paths,i)=>beam[i]&&writeSolid(beam[i],paths));
        left?.setAttribute('transform',k.translateAlong(P,leftBy));
        right?.setAttribute('transform',k.translateAlong(P,rightBy));
        rule?.setAttribute('d',beamRule(g.right,angle));
        const rise=18*Math.sin(angle), coils=returnSpring(rise);
        if(damperRod) writeSolid(damperRod,cyl(18,28,2,36.2,103+rise));
        damperLink?.setAttribute('transform',k.translateAlong(P,[0,0,rise]));
        springBack?.setAttribute('d',coils.back);springFront?.setAttribute('d',coils.front);
        state.previousAngle=angle;
      }
      weight?.setAttribute('transform',k.translateAlong(P,[0,0,32*lift]));
      needle?.setAttribute('transform',`rotate(${state.dial.at*410})`);
      el.style.setProperty('--cm-slam',String(clamp(Math.abs(angle)*lift*4,0,1)));
      el.dataset.hedge=lift>0.98?'off':lift<0.02?'on':'moving';
      el.dataset.tilt=angle.toFixed(5);
      el.dataset.coinPhase=phase.toFixed(5);
      // The lowest coin enters the collection well; the counter stays historical.
      const sink=2.2*smooth((phase-0.82)/0.18);
      stack?.setAttribute('transform',k.translateAlong(P,[0,0,-sink]));
      gate?.setAttribute('transform',k.translateAlong(P,[0,4*Math.sin(Math.PI*smooth(phase/0.22)),0]));
      if(fly) {
        const t=clamp((phase-0.16)/0.6,0,1);
        const landing: k.Point3=[COIN_AT[0]+leftBy[0],COIN_AT[1],COIN_AT[2]+6.6+leftBy[2]-sink];
        const pos: k.Point3=[COIN_START[0]+(landing[0]-COIN_START[0])*t+7*Math.sin(t*Math.PI),
          COIN_START[1]+(landing[1]-COIN_START[1])*t,
          COIN_START[2]+(landing[2]-COIN_START[2])*t*t];
        const squash=1-0.09*Math.sin(Math.PI*clamp((phase-0.76)/0.12,0,1));
        const origin=k.iso([0,0,0],P), target=k.iso(pos,P);
        fly.setAttribute('transform',`translate(${target[0]} ${target[1]}) scale(${1/Math.sqrt(squash)} ${squash}) translate(${-origin[0]} ${-origin[1]})`);
        fly.style.visibility=phase>=0.16&&data.carryApr>0?'visible':'hidden';
      }
    };
    const stop=()=>{ cancelAnimationFrame(state.frame); state.frame=0; state.last=0; };
    const pose=()=>{
      state.lift=input.current.lifted?1:0;
      state.angle.at=input.current.lifted?-0.24:input.current.shockAt>=0?-0.24*(1-data.corr):0;
      state.angle.rate=state.dial.rate=0; state.dial.at=state.angle.at;
      draw(state.angle.at,state.lift,0.08);
    };
    const tick=(now:number)=>{
      state.frame=0;
      if(!state.visible||document.hidden||input.current.paused||still.matches) return;
      const dt=state.last?Math.min((now-state.last)/1000,1/30):1/60;
      state.last=now; state.time+=dt; controller.current.time=state.time;
      const user=input.current;
      const idle=!user.held&&!user.hover&&!user.focus&&state.time-user.lastTouch>4;
      const tourAge=(state.time-1.6)%8.5;
      const shock=user.held?user.drag:shockPulse(state.time-user.shockAt)+(idle&&state.time>1.6?shockPulse(tourAge):0);
      state.lift=follow(state.lift,user.lifted?1:0,dt,0.22);
      const response=responseToShock(shock,data.corr,1-state.lift);
      spring(state.angle,-0.24*response,dt,110,13.5);
      spring(state.dial,state.angle.at,dt,145,18);
      state.phase=(state.phase+coinsPerSecond(data.carryApr)*dt)%1;
      draw(state.angle.at,state.lift,state.phase);
      state.frame=requestAnimationFrame(tick);
    };
    const wake=()=>{
      if(still.matches) { stop(); pose(); return; }
      if(!state.visible||document.hidden||input.current.paused||state.frame) return;
      state.last=0; state.frame=requestAnimationFrame(tick);
    };
    controller.current={wake,time:0};
    const visibility=()=>document.hidden?stop():wake();
    const motion=()=>{stop();still.matches?pose():wake();};
    const observer=new IntersectionObserver(entries=>{
      state.visible=entries[entries.length-1]?.isIntersecting??false;
      state.visible?wake():stop();
    });
    observer.observe(el);
    document.addEventListener('visibilitychange',visibility);
    still.addEventListener('change',motion);
    draw(0,state.lift,0.08);
    return()=>{ stop(); observer.disconnect(); document.removeEventListener('visibilitychange',visibility); still.removeEventListener('change',motion); controller.current.wake=()=>{}; };
  },[data.carryApr,data.corr,g]);

  const touch=()=>{ input.current.lastTouch=controller.current.time; controller.current.wake(); };
  const shock=()=>{
    input.current.shockAt=controller.current.time;
    touch(); setAnnouncement(input.current.lifted?'Same shared shock, hedge lifted: larger imbalance.':'Shared shock, hedge in place: smaller imbalance, not zero risk.');
  };
  const toggle=()=>{
    const next=!input.current.lifted;
    input.current.lifted=next; input.current.shockAt=controller.current.time+0.55;
    setLifted(next); touch();
    setAnnouncement(next?`${data.long} hedge lifted; replaying the same shared shock.`:`${data.long} hedge restored; replaying the same shared shock.`);
  };
  const pause=()=>{const next=!input.current.paused; input.current.paused=next;setPaused(next);controller.current.wake();};
  const release=()=>{ input.current.held=false; touch(); };
  const engagement = {
    onPointerEnter:()=>{input.current.hover=true;touch();},
    onPointerLeave:()=>{input.current.hover=false;touch();},
    onFocusCapture:()=>{input.current.focus=true;touch();},
    onBlurCapture:(e:React.FocusEvent<HTMLDivElement>)=>{
      if(!e.currentTarget.contains(e.relatedTarget as Node | null)) {input.current.focus=false;release();}
    },
  };
  const handlers = {
    onBlur:release,
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{
      if(e.button!==0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      input.current.pointerX=e.clientX;input.current.drag=1;input.current.held=true;input.current.shockAt=controller.current.time;touch();
    },
    onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{
      if(!input.current.held) return;
      input.current.drag=clamp(1+(e.clientX-input.current.pointerX)/100,-1,1);touch();
    },
    onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{
      if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      release();
    },
    onPointerCancel:release,
    onLostPointerCapture:release,
    onClick:(e:React.MouseEvent<HTMLButtonElement>)=>{if(e.detail===0) shock();},
  };
  return {root,lifted,paused,announcement,toggle,pause,handlers,engagement};
}
