interface Window {
  GAME?: {
    mode(): string;
    moveLeft(): void;
    moveRight(): void;
    stopMove(): void;
    drop(): void;
    insertCoin(): void;
  };
}
