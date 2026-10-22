import * as React from 'react';
import * as k from '../../iso/iso-kit';
import { Solid, Line, FaceText } from '../../iso/react/draw';
import { P, LEFT, PAN_Z, COIN_AT, DIAL, DIAL_MATRIX, coin, coinRim, type Part, type Geometry } from './geometry';
import type { CarryMachineProps } from './model';

export const Parts = React.memo(function Parts({ parts }: { parts: Part[] }) {
  return <>{parts.map(part => <g key={part.id} data-part={part.id} className={part.material && `cm-${part.material}`}>
    <Solid paths={part.paths} tone={part.tone} inner={part.detail && <Line d={part.detail} tone="lo" />} />
  </g>)}</>;
});

export function WeightLabel({ x, symbol, side, beta }: { x: number; symbol: string; side: 'short' | 'long'; beta?: number }) {
  return <g transform={k.sideMatrix([x, 10.9], PAN_Z + 18.2, P, 'left')} className="cm-label">
    <text textAnchor="middle" fontSize={6.6}>{side.toUpperCase()} {symbol}</text>
    <text textAnchor="middle" y={6.4} fontSize={3.8} className="cm-muted-label">{beta === undefined ? 'FUNDING IN' : `${beta.toFixed(2)}× HEDGE`}</text>
  </g>;
}

export const Coin = React.memo(function Coin() {
  return <g className="cm-coin"><Solid paths={coin} tone="hi" crease="lo" />
    <Line d={coinRim} tone="mid" />
    <FaceText transform={k.topMatrix([0,0.7],2.3,P)} anchor="middle" size={3} tone="hi">·</FaceText>
  </g>;
});

export function CoinStack() {
  return <g data-coins="stack">{Array.from({length:3},(_,i)=><g key={i} transform={k.translateAlong(P,[COIN_AT[0],COIN_AT[1],COIN_AT[2]+i*2.2])}><Coin /></g>)}</g>;
}

export function Instruments({ g, data, id }: { g: Geometry; data: CarryMachineProps; id: string }) {
  const dialTicks = Array.from({length:49},(_,i)=>{
    const angle = (-120+i*5)*Math.PI/180;
    const r=18.5, inner=r-(i%4===0?3:1.45);
    return `M${Math.sin(angle)*r} ${-Math.cos(angle)*r}L${Math.sin(angle)*inner} ${-Math.cos(angle)*inner}`;
  }).join('');
  return <g key="instruments">
    <Parts parts={g.instruments} />
    <g transform={DIAL_MATRIX} className="cm-gauge">
      <circle className="iso-line" data-tone="lo" r={18.5} />
      <Line d={dialTicks} tone="mid" />
      <text y={-10.5} textAnchor="middle" fontSize={4}>0</text>
      <text y={10.5} textAnchor="middle" fontSize={2.8}>STRETCH</text>
      <path data-needle="" className="cm-needle" d="M-0.65 3L-0.42-12.8L0-15.5L0.42-12.8L0.65 3Z" />
      <circle className="cm-needle-hub" r={1.65} />
      <circle className="iso-line" data-tone="hi" r={0.65} />
    </g>
    <FaceText transform={k.topMatrix([-107,46],16.8,P)} size={3.3} tone="mid">HOURS PAID</FaceText>
    <g transform={k.sideMatrix([-107,65.1],6.3,P,'left')} className="cm-counter">
      <defs><clipPath id={id}><rect x={-1} y={-6.5} width={65} height={8.4} rx={0.6} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        {String(data.hoursPaid).padStart(3,'0').split('').map((digit,i)=><g key={i} transform={`translate(${i*8.5} 0)`}>
          <rect x={0} y={-6.5} width={7.4} height={8} rx={0.65} />
          <text x={3.7} y={0} textAnchor="middle" fontSize={7.8}>{digit}</text>
        </g>)}
        <text x={String(data.hoursPaid).padStart(3,'0').length*8.5+3} fontSize={6.2}>/ {data.hours}</text>
      </g>
    </g>
    <g transform={k.topMatrix([119,46],5.8,P)}><circle className="iso-line" data-tone="faint" r={10.5} />
      <path className="iso-line" data-tone="mid" d="M0-10.5V-7" />
      <path className="iso-line" data-tone="lo" d="M-3.4-.5H3.4V.5H-3.4Z" />
    </g>
  </g>;
}

export function BaseArt({ g }: {g:Geometry}) {
  return <g key="bench">
    <path className="iso-halo" d={k.haloOf({x:-178,y:-64,w:346,d:140,r:10},-25,10,P)} />
    <Parts parts={g.base} />
    <Line d={g.ticks.minor} tone="faint" /><Line d={g.ticks.major} tone="lo" />
  </g>;
}

export function HopperLabel({ short }: { short:string }) {
  return <FaceText transform={k.sideMatrix([-122,47.8],220.8,P,'left')} size={7.2} tone="hi" anchor="middle">{short} LONGS</FaceText>;
}

export const FundingWell = <g key="funding-well">
  <path className="cm-well" d={k.ring(LEFT+13,19,8.1,PAN_Z+2.1,P,64)} />
  <Line d={k.ring(LEFT+13,19,9,PAN_Z+2.2,P,64)} tone="mid" />
</g>;
