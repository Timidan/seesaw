import * as React from 'react';
import { Solid } from '../../iso/react/draw';
import { WIDTH, HEIGHT, LEFT, makeGeometry, returnSpring } from './geometry';
import { BaseArt, Parts, WeightLabel, Coin, CoinStack, Instruments, HopperLabel, FundingWell } from './art';
import { useMachine } from './live';
import { validSnapshot, type CarryMachineProps } from './model';
import '../../iso/iso.css';
import './carry-machine.css';

export type { CarryMachineProps } from './model';

export function CarryMachine(props: {
  short: string; long: string; beta: number; carryApr: number;
  hoursPaid: number; hours: number; corr: number;
  hedgedVolApr: number; dollarVolApr: number;
  /** id of the page heading that names the figure */
  titleId?: string;
}) {
  if (!validSnapshot(props)) return <div className="iso cm-unavailable" role="status">Carry illustration unavailable: a complete funding snapshot is needed.</div>;
  return <Machine data={props} />;
}

function Machine({ data }: {data: CarryMachineProps & { titleId?: string }}) {
  const g=React.useMemo(()=>makeGeometry(data.beta),[data.beta]);
  const coils=React.useMemo(()=>returnSpring(),[]);
  const id=React.useId().replace(/:/g,'');
  const live=useMachine(data,g);
  const caption=`${data.short} longs paid shorts in ${data.hoursPaid} of ${data.hours} observed hours; a ${data.beta.toFixed(2)}× long ${data.long} hedge softens shared price moves but leaves price risk.`;
  return <div className="iso cm" ref={live.root} {...live.engagement} data-theme="dark">
    <figure className="iso-figure cm-figure" aria-labelledby={data.titleId} aria-label={data.titleId ? undefined : 'The carry machine'} aria-describedby={`${id}-caption`}>
      <div className="iso-plate cm-card">
        <button type="button" className="cm-stage iso-stage" {...live.handlers}
          aria-label={`Apply a shared price shock to the ${data.short}/${data.long} balance`}
          aria-describedby={`${id}-hint`}>
          <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
            aria-label={`A coin hopper marked ${data.short} longs feeds a short ${data.short} pan, balanced by a ${data.beta.toFixed(2)} times long ${data.long} counterweight; the gauge shows remaining imbalance.`}>
            <BaseArt g={g} />
            <Parts parts={g.hopper.slice(0,5)} />
            <Parts parts={g.structure.slice(0,-3)} />
            <path data-spring="back" className="iso-line" data-tone="lo" d={coils.back} />
            <g data-damper-rod=""><Parts parts={[g.structure[g.structure.length-3]]} /></g>
            <path data-spring="front" className="iso-line" data-tone="mid" d={coils.front} />
            <g data-damper-link=""><Parts parts={g.structure.slice(-2)} /></g>
            <g data-pan="short">
              <Parts parts={g.leftPan} />
              <Parts parts={g.shortWeight} />
              <WeightLabel x={LEFT} symbol={data.short} side="short" />
              {FundingWell}<CoinStack />
              <Parts parts={[g.rims[0]]} />
            </g>
            <g data-pan="hedge">
              <Parts parts={g.rightPan} />
              <g data-weight="hedge"><Parts parts={g.longWeight} /><WeightLabel x={g.right} symbol={data.long} side="long" beta={data.beta} /></g>
              <Parts parts={[g.rims[1]]} />
            </g>
            {g.beam.map((paths,i)=><g key={i} data-beam={i} data-part={`beam-${i}`} className="cm-steel"><Solid paths={paths} tone={i===1?'mid':'hi'} crease="none" /></g>)}
            <path data-beam-rule="" className="iso-line" data-tone="mid" d={g.rule} />
            <g data-coin="flying" visibility="hidden"><Coin /></g>
            <Parts parts={g.hopper.slice(5)} /><HopperLabel short={data.short} />
            <g data-gate=""><Parts parts={g.gate} /></g>
            <Instruments g={g} data={data} id={`${id}-digits`} />
          </svg>
        </button>
        <div className="cm-bottom">
          <div className="cm-controls">
            <span id={`${id}-hint`} className="cm-hint">Press the beam</span>
            <div className="cm-buttons">
              <button type="button" className="cm-toggle" onClick={live.toggle}>
                <svg viewBox="0 0 18 18" aria-hidden="true"><path d={live.lifted?'M9 3v11m-4-4 4 4 4-4M3 16h12':'M9 14V3M5 7l4-4 4 4M3 16h12'} /></svg>
                {live.lifted?'Restore the hedge':'Lift the hedge'}
              </button>
              <button type="button" className="cm-pause" onClick={live.pause} aria-label={live.paused?'Resume illustration':'Pause illustration'}>
                <svg viewBox="0 0 16 16" aria-hidden="true">{live.paused?<path d="m5 3 7 5-7 5Z" />:<path d="M5 3v10M11 3v10" />}</svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="cm-sr-only" id={`${id}-caption`}>{caption} Motion is illustrated and time is accelerated.</figcaption>
    </figure>
    <span className="cm-sr-only" aria-live="polite" aria-atomic="true">{live.announcement}</span>
  </div>;
}
