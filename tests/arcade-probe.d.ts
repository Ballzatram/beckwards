interface Window {
  arcadeAudioProbe?: {
    decoded: number[];
    lastInputAt: number;
    starts: {
      duration: number;
      loop: boolean;
      state: string;
      mode: string;
      at: number;
      inputDelay: number;
    }[];
    stops: number;
  };
}
