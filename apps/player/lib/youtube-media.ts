'use client';

/**
 * The official YouTube IFrame player behind the small slice of the HTMLMediaElement API
 * the playback controls use (play, pause, currentTime, duration, volume, events), so the
 * controls work unchanged. The iframe stays visible in Now Playing, as YouTube requires.
 */

type YTPlayer = {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  getPlaybackRate(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: { onReady: () => void; onStateChange: (event: { data: number }) => void };
    }
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return api;
}

export class YouTubeMedia extends EventTarget {
  private player: YTPlayer | null = null;
  private ready = false;
  private pending: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private level = 1;

  /** Creates the player inside `container`; the API replaces the element it gets, so it gets a child. */
  async attach(container: HTMLElement): Promise<void> {
    const YT = await loadApi();
    this.detach();
    const target = document.createElement('div');
    container.appendChild(target);
    this.player = new YT.Player(target, {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          this.ready = true;
          this.player?.setVolume(Math.round(this.level * 100));
          if (this.pending !== null) {
            this.player?.loadVideoById(this.pending);
            this.pending = null;
          }
        },
        onStateChange: ({ data }) => this.onState(data, YT),
      },
    });
  }

  detach(): void {
    this.stopClock();
    this.player?.destroy();
    this.player = null;
    this.ready = false;
  }

  /** Starts the video as soon as the player is ready. */
  load(videoId: string): void {
    if (this.player && this.ready) this.player.loadVideoById(videoId);
    else this.pending = videoId;
  }

  play(): Promise<void> {
    this.player?.playVideo();
    return Promise.resolve();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  get currentTime(): number {
    return this.ready ? (this.player?.getCurrentTime() ?? 0) : 0;
  }

  set currentTime(seconds: number) {
    this.player?.seekTo(seconds, true);
  }

  get duration(): number {
    const seconds = this.ready ? (this.player?.getDuration() ?? 0) : 0;
    return seconds > 0 ? seconds : Number.NaN;
  }

  get volume(): number {
    return this.level;
  }

  set volume(level: number) {
    this.level = level;
    this.player?.setVolume(Math.round(level * 100));
  }

  get playbackRate(): number {
    return this.ready ? (this.player?.getPlaybackRate() ?? 1) : 1;
  }

  private onState(state: number, YT: YTNamespace): void {
    if (state === YT.PlayerState.PLAYING) {
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('play'));
      this.startClock();
    } else if (state === YT.PlayerState.PAUSED) {
      this.stopClock();
      this.dispatchEvent(new Event('pause'));
    } else if (state === YT.PlayerState.ENDED) {
      this.stopClock();
      this.dispatchEvent(new Event('ended'));
    }
  }

  private startClock(): void {
    this.stopClock();
    this.timer = setInterval(() => this.dispatchEvent(new Event('timeupdate')), 250);
  }

  private stopClock(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
