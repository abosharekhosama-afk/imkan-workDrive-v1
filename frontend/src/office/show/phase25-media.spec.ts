import {defaultShow} from './model';
import {addElement,updateMediaSettings,setMediaSource} from './commands';

describe('IMKAN Show Phase 8 - media',()=>{
  it('creates media with production-safe defaults',()=>{
    let d=defaultShow();
    d=addElement(d,'video');
    const e=d.slides[0].elements.at(-1)!;
    expect(e.type).toBe('video');
    expect(e.mediaControls).toBe(true);
    expect(e.mediaPreload).toBe('metadata');
    expect(e.mediaFit).toBe('contain');
  });
  it('preserves source, poster, captions and playback settings',()=>{
    let d=defaultShow(); d=addElement(d,'video');
    const e=d.slides[0].elements.at(-1)!;
    d=setMediaSource(d,e.id,'https://example.test/video.mp4');
    d=updateMediaSettings(d,e.id,{poster:'https://example.test/poster.jpg',mediaAutoplay:true,mediaLoop:true,mediaMuted:true,mediaVolume:.65,mediaTrimStart:2,mediaTrimEnd:18,mediaFit:'cover',mediaControls:true,mediaPreload:'auto',mediaCaptionSrc:'https://example.test/captions.vtt',mediaCaptionLabel:'English',mediaCaptionLang:'en'});
    const next=d.slides[0].elements.find(x=>x.id===e.id)!;
    expect(next.src).toContain('video.mp4'); expect(next.poster).toContain('poster.jpg');
    expect(next.mediaCaptionSrc).toContain('captions.vtt'); expect(next.mediaTrimStart).toBe(2);
    expect(next.mediaTrimEnd).toBe(18); expect(next.mediaFit).toBe('cover'); expect(next.mediaVolume).toBe(.65);
  });
});
